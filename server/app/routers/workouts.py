from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
from app.models.workout import WorkoutPlan, WorkoutDay, ExerciseRef, WorkoutSession
from app.database.connection import db  # your Mongo client
from bson import ObjectId
from app.auth.jwt_auth import get_current_user_id

router = APIRouter(prefix="/workouts", tags=["Workouts"])

def _oid(val: str) -> ObjectId:
    """Convert string to ObjectId, with proper error handling"""
    if not val:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    try:
        return ObjectId(val)
    except Exception as e:
        # If it's already an ObjectId, return it
        if isinstance(val, ObjectId):
            return val
        # If conversion fails, raise a proper error
        raise HTTPException(status_code=400, detail=f"Invalid user ID format: {val}")

def _convert_objectids_to_strings(data):
    """Convert MongoDB ObjectIds to strings in a document"""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, dict):
                result[key] = _convert_objectids_to_strings(value)
            elif isinstance(value, list):
                result[key] = [_convert_objectids_to_strings(item) for item in value]
            elif hasattr(value, '__dict__'):
                # Handle objects with __dict__ attribute (like Pydantic models)
                result[key] = _convert_objectids_to_strings(value.__dict__)
            else:
                result[key] = value
        return result
    elif isinstance(data, list):
        return [_convert_objectids_to_strings(item) for item in data]
    elif hasattr(data, '__dict__'):
        # Handle objects with __dict__ attribute (like Pydantic models)
        return _convert_objectids_to_strings(data.__dict__)
    else:
        return data

# -------------------- Custom Plan per-date storage --------------------
# Each entry in collection `workout_entries`:
# { user_id: ObjectId, date: 'YYYY-MM-DD', plan_type: 'AI'|'CUSTOM', workout_details: {...}, created_at, updated_at }

def _ensure_date_str(d: Any) -> str:
    if isinstance(d, date):
        return d.isoformat()
    if isinstance(d, datetime):
        return d.date().isoformat()
    return str(d)

def _user_match_filter(user_id_str: str, user_oid: ObjectId) -> dict:
    """Return a filter that matches both canonical ObjectId and any legacy string user_id."""
    try:
        # Avoid duplicate $or entries if the string is equal to oid string
        if str(user_oid) == str(user_id_str):
            return {"user_id": user_oid}
    except Exception:
        pass
    return {"$or": [{"user_id": user_oid}, {"user_id": user_id_str}]}

@router.post("/custom/plan/check-conflicts")
def check_custom_plan_conflicts(payload: dict, user_id: str = Depends(get_current_user_id)):
    """Check if any of the provided dates already have workouts (AI or CUSTOM). Payload: { dates: string[] }"""
    user_oid = _oid(user_id)
    dates: List[str] = [ _ensure_date_str(x) for x in (payload.get("dates") or []) ]
    if not dates:
        raise HTTPException(400, "dates must be a non-empty array")
    user_filter = _user_match_filter(user_id, user_oid)
    cursor = db.workout_entries.find({**user_filter, "date": {"$in": dates}})
    conflicts = []
    conflicted_dates = set()
    for doc in cursor:
        d = doc.get("date")
        conflicted_dates.add(d)
        conflicts.append({
            "date": d,
            "plan_type": (doc.get("plan_type") or "UNKNOWN")
        })

    # Also consider existing weekly plan for the same weekdays within the current ISO week
    try:
        plan = db.workout_plans.find_one({"$or": [{"user_id": user_oid}, {"user_id": user_id}]})
        if plan and isinstance(plan.get("days"), list):
            # Compute current week's Monday (UTC) and map provided dates -> weekday index
            base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            monday = base.fromisocalendar(base.isocalendar().year, base.isocalendar().week, 1)
            # Build mapping from weekday idx to its date string in current week
            weekday_to_date = {i: (monday + timedelta(days=i)).date().isoformat() for i in range(7)}
            # Determine which weekday indexes are targeted by the input dates
            targeted_weekdays: set[int] = set()
            for dstr in dates:
                try:
                    targeted_weekdays.add(datetime.fromisoformat(dstr).weekday())
                except Exception:
                    continue
            # For each targeted weekday, if plan has exercises, mark conflict for that week's date if not already
            for day in plan.get("days", []):
                try:
                    idx = int(day.get("weekday", -1))
                except Exception:
                    idx = -1
                if idx in targeted_weekdays:
                    exs = day.get("exercises") or []
                    if isinstance(exs, list) and len(exs) > 0:
                        dstr = weekday_to_date.get(idx)
                        if dstr and dstr not in conflicted_dates:
                            conflicts.append({"date": dstr, "plan_type": "PLAN"})
                            conflicted_dates.add(dstr)
    except Exception:
        # Non-fatal; fallback to entry-based conflicts only
        pass

    return {"conflicts": conflicts}

@router.post("/custom/plan/save")
def save_custom_plan(payload: dict, user_id: str = Depends(get_current_user_id)):
    """
    Save custom plan entries per date with optional replacement.
    Payload: {
      replace: boolean,
      entries: [ { date: 'YYYY-MM-DD', workout_details: { days?:[], name?: string, description?: string, exercises?: any[] } } ]
    }
    """
    user_oid = _oid(user_id)
    replace: bool = bool(payload.get("replace"))
    entries: List[Dict[str, Any]] = payload.get("entries") or []
    if not entries:
        raise HTTPException(400, "entries must be a non-empty array")

    # Normalize entries
    normalized: List[Dict[str, Any]] = []
    target_dates: List[str] = []
    for e in entries:
        dstr = _ensure_date_str(e.get("date"))
        if not dstr:
            raise HTTPException(400, "each entry requires a date")
        target_dates.append(dstr)
        details = e.get("workout_details") or {}
        # Persist meta fields if provided
        plan_name = details.get("plan_name")
        plan_description = details.get("plan_description")
        weekday_from_client = details.get("weekday")
        normalized.append({
            "user_id": user_oid,
            "date": dstr,
            "plan_type": "CUSTOM",
            "workout_details": details,
            "plan_name": plan_name,
            "plan_description": plan_description,
            "weekday": weekday_from_client,
            "updated_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        })

    # Transactional semantics: delete existing on dates then insert new.
    # If a replica set is configured, use a session; otherwise perform best-effort sequence.
    try:
        # Attempt with session (will work on replica set)
        with db.client.start_session() as session:
            def _txn(s):
                user_filter = _user_match_filter(user_id, user_oid)
                if replace:
                    db.workout_entries.delete_many({**user_filter, "date": {"$in": target_dates}}, session=s)
                else:
                    # If not replacing, ensure there are no conflicts
                    existing = list(db.workout_entries.find({**user_filter, "date": {"$in": target_dates}}, session=s))
                    if existing:
                        raise HTTPException(409, "Conflicts exist for provided dates")
                if normalized:
                    db.workout_entries.insert_many(normalized, ordered=True, session=s)
            session.with_transaction(_txn)
    except HTTPException:
        raise
    except Exception:
        # Fallback without session
        user_filter = _user_match_filter(user_id, user_oid)
        if replace:
            db.workout_entries.delete_many({**user_filter, "date": {"$in": target_dates}})
        else:
            existing = list(db.workout_entries.find({**user_filter, "date": {"$in": target_dates}}))
            if existing:
                raise HTTPException(409, "Conflicts exist for provided dates")
        if normalized:
            db.workout_entries.insert_many(normalized, ordered=True)

    # After persisting per-date entries, also update the consolidated weekly workout_plans document
    try:
        # Ensure a plan document exists
        plan_doc = db.workout_plans.find_one({"user_id": user_oid})
        if not plan_doc:
            # Initialize a 7-day skeleton
            plan_doc = {
                "user_id": user_oid,
                "days": [
                    {"name": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], "weekday": i, "exercises": []}
                    for i in range(7)
                ],
                "updated_at": datetime.utcnow(),
            }
            db.workout_plans.insert_one(plan_doc)

        # Build a mapping of weekday -> exercises from entries to apply into the plan
        weekday_to_exs: dict[int, list] = {}
        for e in entries:
            dstr = _ensure_date_str(e.get("date"))
            details = (e.get("workout_details") or {})
            exs = details.get("exercises") or []
            # Prefer explicit weekday from client if provided, else derive from date
            weekday_idx: Optional[int] = None
            try:
                if details.get("weekday") is not None:
                    # Client passes UI weekday Mon=1..Sun=7; convert to Mon=0..Sun=6
                    weekday_idx = (int(details.get("weekday")) + 6) % 7
                else:
                    dt = datetime.fromisoformat(dstr)
                    weekday_idx = dt.weekday()  # Mon=0..Sun=6
            except Exception:
                pass
            if weekday_idx is None:
                continue
            if isinstance(exs, list):
                weekday_to_exs[weekday_idx] = exs

        if weekday_to_exs:
            # Update the plan's days array in place
            days_list = plan_doc.get("days") if isinstance(plan_doc, dict) else None
            if not isinstance(days_list, list):
                days_list = []
            # Ensure 7 positions
            if len(days_list) < 7:
                existing = {int(d.get("weekday", -1)) for d in days_list if isinstance(d, dict)}
                for i in range(7):
                    if i not in existing:
                        days_list.append({"name": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], "weekday": i, "exercises": []})
            # Apply exercises for provided weekdays
            for day in days_list:
                try:
                    idx = int(day.get("weekday", -1))
                except Exception:
                    idx = -1
                if idx in weekday_to_exs:
                    day["exercises"] = weekday_to_exs[idx]

            # Persist the merged plan
            db.workout_plans.update_one(
                {"user_id": user_oid},
                {"$set": {
                    "days": days_list,
                    "updated_at": datetime.utcnow(),
                    "source": "custom",
                    # persist last provided meta at plan level for display/backups
                    "plan_name": next((e.get("workout_details", {}).get("plan_name") for e in reversed(entries) if isinstance(e, dict)), None),
                    "plan_description": next((e.get("workout_details", {}).get("plan_description") for e in reversed(entries) if isinstance(e, dict)), None),
                }},
                upsert=True,
            )
    except Exception as e:
        # Non-fatal: leave per-date entries as source of truth; overlay will still show on GET
        print(f"[Custom-Save] Failed to update weekly plan document: {e}")

    return {"ok": True, "replaced": replace, "dates": target_dates}

@router.get("/plan")
def get_plan(user_id: str = Depends(get_current_user_id)):
    # Convert user_id to ObjectId for database queries
    user_oid = _oid(user_id)
    
    # Try to find plan with ObjectId first
    plan = db.workout_plans.find_one({"user_id": user_oid})
    
    # If not found, try with string user_id (for backward compatibility)
    if not plan:
        plan = db.workout_plans.find_one({"user_id": user_id})
        
        # If found with string user_id, migrate it to ObjectId
        if plan:
            # Remove the old plan and create a new one with ObjectId
            db.workout_plans.delete_one({"user_id": user_id})
            plan["user_id"] = user_oid
            plan["_id"] = None  # Remove the old _id
            db.workout_plans.insert_one(plan)
    
    # If still no plan, create a new one
    if not plan:
        # minimal default: 7 empty days
        days = [WorkoutDay(weekday=i, name=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]).dict() for i in range(7)]
        plan_doc = WorkoutPlan(user_id=user_id, days=days).dict()
        db.workout_plans.insert_one(plan_doc)
        plan = plan_doc
    
    # Overlay per-date custom entries for the current ISO week so calendar reflects recent custom saves
    try:
        user_oid = _oid(user_id)
        # Compute current week's Monday (UTC) and list dates Mon..Sun
        base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        monday = base.fromisocalendar(base.isocalendar().year, base.isocalendar().week, 1)
        week_dates = [(monday + timedelta(days=i)).date().isoformat() for i in range(7)]
        # Fetch entries for this week for this user (match both oid and legacy string)
        user_filter = _user_match_filter(user_id, user_oid)
        cursor = db.workout_entries.find({**user_filter, "date": {"$in": week_dates}})
        # Build a map date->exercises
        date_to_exs: dict[str, list] = {}
        for doc in cursor:
            d = str(doc.get("date"))
            details = doc.get("workout_details") or {}
            exs = details.get("exercises") or []
            if isinstance(exs, list):
                date_to_exs[d] = exs
        if date_to_exs:
            # Ensure plan has a days list we can modify
            days_list = plan.get("days") if isinstance(plan, dict) else None
            if not isinstance(days_list, list):
                days_list = []
                plan["days"] = days_list
            # Create empty days if none
            if len(days_list) < 7:
                # Expand to 7 days structure if needed
                existing = {int(d.get("weekday", -1)) for d in days_list if isinstance(d, dict)}
                for i in range(7):
                    if i not in existing:
                        days_list.append({"name": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], "weekday": i, "exercises": []})
            # Overlay each date's exercises into its weekday
            for i, dstr in enumerate(week_dates):
                if dstr in date_to_exs:
                    # Find the day with matching weekday index i
                    for day in days_list:
                        try:
                            if int(day.get("weekday", -1)) == i:
                                day["exercises"] = date_to_exs[dstr]
                                break
                        except Exception:
                            continue
    except Exception as e:
        # Non-fatal: log and continue returning base plan
        print(f"[Workout-Get] Overlay custom entries failed: {e}")

    # Debug: Log what's being returned to frontend
    try:
        print(f"[Workout-Get] Returning plan for user {user_id}")
        if plan and "days" in plan:
            print(f"[Workout-Get] Returning days structure: {len(plan['days'])} days")
            for day_idx, day in enumerate(plan["days"]):
                print(f"[Workout-Get] Returning Day {day_idx} ({day.get('name')}): {len(day.get('exercises', []))} exercises")
                for ex_idx, ex in enumerate(day.get("exercises", [])):
                    if not ex.get("gifUrl"):
                        print(f"[Workout-Get] WARNING: Returning Day {day_idx} exercise {ex_idx} '{ex.get('name')}' missing gifUrl")
                    else:
                        print(f"[Workout-Get] Returning Day {day_idx} exercise {ex_idx} '{ex.get('name')}' has gifUrl: {ex.get('gifUrl')[:50]}...")
        else:
            print(f"[Workout-Get] No plan found or plan missing days structure")
    except Exception as e:
        print(f"[Workout-Get] Debug logging failed: {e}")
    
    return _convert_objectids_to_strings(plan)

@router.patch("/plan")
def replace_plan(payload: dict, user_id: str = Depends(get_current_user_id)):
    """Replace the entire workout plan (used by 'Use this plan' action).
    Expected payload shape:
    { "days": [ { "name": str, "weekday": int, "exercises": [ { exercise_id,name,sets,reps,duration_seconds,rest_seconds,notes } ] } ] }
    """
    user_oid = _oid(user_id)
    days = payload.get("days") or []
    if not isinstance(days, list) or not days:
        raise HTTPException(400, "days is required and must be a non-empty list")

    # Normalize exercises into DB shape
    norm_days = []
    for d in days:
        exs = []
        for e in d.get("exercises", []):
            exs.append({
                "exercise_id": e.get("exercise_id") or e.get("exerciseId") or e.get("id") or e.get("name", "")[:12],
                "name": e.get("name"),
                "sets": e.get("sets", 3),
                "reps": e.get("reps"),
                "duration_seconds": e.get("duration_seconds"),
                "rest_seconds": e.get("rest_seconds", 60),
                "notes": e.get("notes", ""),
                "gifUrl": e.get("gifUrl"),  # Preserve gifUrl for exercise images
            })
        norm_days.append({
            "name": d.get("name") or d.get("day") or "Day",
            "weekday": int(d.get("weekday", 0)),
            "exercises": exs,
        })

    # Determine user's anchor weekday (join day) and this week's anchor date
    # Default anchor weekday = Monday (0)
    anchor_weekday = 0
    try:
        # Fetch user to get created_at
        user_doc = db.users.find_one({"_id": user_oid})
        if user_doc and user_doc.get("created_at"):
            created_at = user_doc["created_at"]
            if isinstance(created_at, datetime):
                anchor_weekday = created_at.weekday()  # Mon=0..Sun=6
    except Exception:
        pass

    # Compute the current week's Monday and anchor date
    monday = datetime.utcnow()
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    monday = monday.fromisocalendar(monday.isocalendar().year, monday.isocalendar().week, 1)
    anchor_date = monday + timedelta(days=anchor_weekday)
    
    # Debug: Log what's being saved to database
    try:
        print(f"[Workout-Save] Saving plan for user {user_id}")
        print(f"[Workout-Save] Normalized days structure: {len(norm_days)} days")
        for day_idx, day in enumerate(norm_days):
            print(f"[Workout-Save] Day {day_idx} ({day.get('name')}): {len(day.get('exercises', []))} exercises")
            for ex_idx, ex in enumerate(day.get("exercises", [])):
                if not ex.get("gifUrl"):
                    print(f"[Workout-Save] WARNING: Day {day_idx} exercise {ex_idx} '{ex.get('name')}' missing gifUrl")
                else:
                    print(f"[Workout-Save] Day {day_idx} exercise {ex_idx} '{ex.get('name')}' has gifUrl: {ex.get('gifUrl')[:50]}...")
    except Exception as e:
        print(f"[Workout-Save] Debug logging failed: {e}")
    
    db.workout_plans.update_one(
        {"user_id": user_oid},
        {"$set": {
            "user_id": user_oid,
            "days": norm_days,
            # After saving the generated plan, keep AI mode disabled so UI returns to normal view
            "ai_enabled": False,
            # Persist anchor weekday and last generated anchor date for weekly refresh cadence
            "ai_anchor_weekday": anchor_weekday,
            "last_generated_anchor": anchor_date.date().isoformat(),
            # Back-compat: also keep last_generated_monday for older clients
            "last_generated_monday": monday.date().isoformat(),
            "source": "ai",
            "updated_at": datetime.utcnow(),
        }},
        upsert=True,
    )

    saved = db.workout_plans.find_one({"user_id": user_oid})

    # Also synchronize per-date entries for current ISO week by replacing overlaps with AI plan
    try:
        # Compute current ISO Monday (UTC) and dates Mon..Sun
        base = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        monday_utc = base.fromisocalendar(base.isocalendar().year, base.isocalendar().week, 1)
        week_dates = [(monday_utc + timedelta(days=i)).date().isoformat() for i in range(7)]

        # Build per-date entries from AI plan days
        weekday_to_date = {i: week_dates[i] for i in range(7)}
        per_date_entries: list[dict] = []
        for d in norm_days:
            try:
                idx = int(d.get("weekday", -1))
            except Exception:
                idx = -1
            if idx < 0 or idx > 6:
                continue
            exs = d.get("exercises") or []
            if not isinstance(exs, list) or len(exs) == 0:
                continue
            per_date_entries.append({
                "user_id": user_oid,
                "date": weekday_to_date[idx],
                "plan_type": "AI",
                "workout_details": {"exercises": exs, "plan_type": "AI", "weekday": idx},
                "updated_at": datetime.utcnow(),
                "created_at": datetime.utcnow(),
            })

        # Replace any existing entries in those dates with new AI entries
        user_filter = _user_match_filter(user_id, user_oid)
        try:
            with db.client.start_session() as session:
                def _txn(s):
                    db.workout_entries.delete_many({**user_filter, "date": {"$in": week_dates}}, session=s)
                    if per_date_entries:
                        db.workout_entries.insert_many(per_date_entries, ordered=True, session=s)
                session.with_transaction(_txn)
        except Exception:
            db.workout_entries.delete_many({**user_filter, "date": {"$in": week_dates}})
            if per_date_entries:
                db.workout_entries.insert_many(per_date_entries, ordered=True)
    except Exception as e:
        print(f"[Workout-Plan-Replace] Failed to sync per-date entries with AI plan: {e}")
    
    # Debug: Log what's retrieved from database
    try:
        print(f"[Workout-Save] Retrieved plan from database for user {user_id}")
        if saved and "days" in saved:
            print(f"[Workout-Save] Retrieved days structure: {len(saved['days'])} days")
            for day_idx, day in enumerate(saved["days"]):
                print(f"[Workout-Save] Retrieved Day {day_idx} ({day.get('name')}): {len(day.get('exercises', []))} exercises")
                for ex_idx, ex in enumerate(day.get("exercises", [])):
                    if not ex.get("gifUrl"):
                        print(f"[Workout-Save] WARNING: Retrieved Day {day_idx} exercise {ex_idx} '{ex.get('name')}' missing gifUrl")
                    else:
                        print(f"[Workout-Save] Retrieved Day {day_idx} exercise {ex_idx} '{ex.get('name')}' has gifUrl: {ex.get('gifUrl')[:50]}...")
        else:
            print(f"[Workout-Save] No plan found or plan missing days structure")
    except Exception as e:
        print(f"[Workout-Save] Debug logging failed: {e}")
    
    return _convert_objectids_to_strings(saved)

@router.delete("/plan")
def delete_plan(user_id: str = Depends(get_current_user_id)):
    user_oid = _oid(user_id)
    result = db.workout_plans.delete_one({"user_id": user_oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Plan not found")
    return {"ok": True, "message": "Workout plan deleted successfully"}

@router.patch("/plan/day/{weekday}/add")
def add_exercise_to_day(weekday: int, ex: ExerciseRef, user_id: str = Depends(get_current_user_id)):
    if weekday < 0 or weekday > 6:
        raise HTTPException(400, "weekday 0..6")
    
    # Convert user_id to ObjectId for database queries
    user_oid = _oid(user_id)
    
    result = db.workout_plans.update_one(
        {"user_id": user_oid, "days.weekday": weekday},
        {"$push": {"days.$.exercises": ex.dict()}, "$set": {"updated_at": datetime.utcnow()}},
    )
    
    if result.matched_count == 0:
        raise HTTPException(404, "Plan/day not found")
    
    return {"ok": True}

@router.get("/session/today")
def get_todays_session(user_id: str = Depends(get_current_user_id)):
    today = date.today().isoformat()
    # Convert user_id to ObjectId for database queries
    user_oid = _oid(user_id)
    sess = db.workout_sessions.find_one({"user_id": user_oid, "date": today})
    if sess:
        return _convert_objectids_to_strings(sess)

    # build from today's plan
    plan = db.workout_plans.find_one({"user_id": user_oid})
    if not plan:
        raise HTTPException(404, "No plan")

    # Normalize different historical plan shapes into days[]
    days_list = None
    if isinstance(plan, dict):
        if isinstance(plan.get("days"), list):
            days_list = plan.get("days")
        elif isinstance(plan.get("plan"), dict) and isinstance(plan.get("plan", {}).get("days"), list):
            days_list = plan.get("plan", {}).get("days")
        elif isinstance(plan.get("week"), list):
            # Convert legacy AI week format to days
            days_list = []
            for idx, d in enumerate(plan.get("week") or []):
                days_list.append({
                    "name": d.get("day") or d.get("name") or ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][idx % 7],
                    "weekday": idx % 7,
                    "exercises": d.get("exercises") or []
                })

    if not isinstance(days_list, list):
        days_list = []

    weekday = datetime.today().weekday()
    day = next((d for d in days_list if int(d.get("weekday", -1)) == weekday), None)
    if not day:
        day = {"exercises": []}

    # Sanitize plan exercises to match ExerciseRef types (reps should be int and certain fields coerced to strings)
    sanitized: list = []
    for e in day.get("exercises", []):
        ex = dict(e)
        # Coerce reps to int when possible; otherwise remove to satisfy schema
        reps_val = ex.get("reps")
        if isinstance(reps_val, str):
            try:
                ex["reps"] = int(reps_val)
            except Exception:
                ex.pop("reps", None)
        # Ensure rest_seconds int
        if "rest_seconds" in ex and isinstance(ex["rest_seconds"], str):
            try:
                ex["rest_seconds"] = int(ex["rest_seconds"])
            except Exception:
                ex.pop("rest_seconds", None)
        # Map exerciseId -> exercise_id if needed
        if "exerciseId" in ex and "exercise_id" not in ex:
            ex["exercise_id"] = ex.pop("exerciseId")
        # Ensure gifUrl is preserved for exercise images
        if "gifUrl" not in ex and "gif_url" in ex:
            ex["gifUrl"] = ex.pop("gif_url")
        # Coerce list-typed metadata from external sources to strings
        for meta_key in ("target", "equipment", "bodyPart"):
            if meta_key in ex and isinstance(ex[meta_key], list):
                try:
                    ex[meta_key] = ", ".join([str(x) for x in ex[meta_key]])
                except Exception:
                    ex[meta_key] = str(ex[meta_key])
        sanitized.append(ExerciseRef(**ex))

    session = WorkoutSession(
        user_id=user_id, date=today,
        exercises=sanitized
    ).dict()
    result = db.workout_sessions.insert_one(session)
    
    # Fetch the inserted session and convert ObjectIds
    inserted_session = db.workout_sessions.find_one({"_id": result.inserted_id})
    return _convert_objectids_to_strings(inserted_session)

@router.patch("/session/complete-exercise/{exercise_id}")
def complete_exercise(exercise_id: str, user_id: str = Depends(get_current_user_id)):
    today = date.today().isoformat()
    # Convert user_id to ObjectId for database queries
    user_oid = _oid(user_id)
    r = db.workout_sessions.update_one(
        {"user_id": user_oid, "date": today},
        {"$addToSet": {"completed_exercise_ids": exercise_id}}
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}
