# app/routers/realtime.py
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta
import httpx, os, random, base64
import asyncio
import time
from typing import Dict, Any

from app.auth.jwt_auth import get_current_user_id
from app.database.connection import db

router = APIRouter(prefix="/api/realtime", tags=["Realtime"])

GOOGLE_FIT_URL = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate"
FITBIT_URL = "https://api.fitbit.com"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Health monitoring
api_health_status = {
    "google_fit": {"status": "unknown", "last_check": None, "error_count": 0},
    "fitbit": {"status": "unknown", "last_check": None, "error_count": 0}
}

# No caching for realtime data - we want fresh data every time

# Circuit breaker for Google Fit API
circuit_breaker = {
    "google_fit": {
        "failure_count": 0,
        "last_failure_time": None,
        "state": "closed",  # closed, open, half_open
        "failure_threshold": 5,
        "recovery_timeout": 60  # seconds
    }
}

# Circuit breaker for Fitbit API
fitbit_breaker = {
    "failure_count": 0,
    "last_failure_time": None,
    "state": "closed",  # closed, open, half_open
    "failure_threshold": int(os.getenv("FITBIT_BREAKER_THRESHOLD", "6")),
    "recovery_timeout": int(os.getenv("FITBIT_BREAKER_COOLDOWN", "120"))  # seconds
}

# -----------------------
# Helpers
# -----------------------

# Process all Google Fit requests in parallel (optimized like Gemini's approach)
async def parallel_fetch_google_fit(token: str, data_types: list) -> Dict[str, Any]:
    """Fetch all Google Fit data types in parallel for maximum speed."""
    results = {}
    
    print(f"🚀 Fetching {len(data_types)} metrics in parallel...")
    start_time = asyncio.get_event_loop().time()
    
    # Get user data once for all requests
    user = db.users.find_one({"access_token": token})
    last_sync_timestamp = user.get("last_sync_timestamp") if user else None
    
    # IMPORTANT: Always fetch from start of current day (midnight) to get all today's data
    # This ensures we get real-time data including steps from today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_millis = int(today_start.timestamp() * 1000)
    
    if not last_sync_timestamp:
        # Default to start of today for first sync
        last_sync_timestamp = today_start_millis
    else:
        # Always look back at least to start of today to ensure we get today's data
        # Google Fit may have sync delays, so we need to re-fetch today's data each time
        last_sync_timestamp = min(last_sync_timestamp, today_start_millis)
    
    current_time_millis = int(datetime.utcnow().timestamp() * 1000)
    
    # Log the time range for debugging
    from_time = datetime.fromtimestamp(last_sync_timestamp / 1000).strftime('%Y-%m-%d %H:%M:%S')
    to_time = datetime.fromtimestamp(current_time_millis / 1000).strftime('%Y-%m-%d %H:%M:%S')
    print(f"📅 Fetching data from {from_time} to {to_time}")

    # Reuse a single HTTP/2 AsyncClient for true parallelism and connection reuse
    async with httpx.AsyncClient(
        timeout=20.0,
        limits=httpx.Limits(max_keepalive_connections=50, max_connections=100),
        http2=True
    ) as client:
        # Create all tasks at once - they will all start simultaneously
        tasks = []
        for data_type in data_types:
            task = asyncio.create_task(
                fetch_google_fit_with_client(
                    client,
                    token,
                    data_type,
                    last_sync_timestamp,
                    current_time_millis
                )
            )
            tasks.append((data_type, task))
        
        try:
            # Execute all requests in parallel with a reasonable timeout
            batch_results = await asyncio.wait_for(
                asyncio.gather(*[task for _, task in tasks], return_exceptions=True),
                timeout=25.0  # allow a bit more for aggregate parallel set
            )
            
            end_time = asyncio.get_event_loop().time()
            execution_time = end_time - start_time
            print(f"⏱️ Parallel execution completed in {execution_time:.2f} seconds")
            
            success_count = 0
            for i, (data_type, _) in enumerate(tasks):
                result = batch_results[i]
                if isinstance(result, Exception):
                    print(f"⚠️ {data_type}: {str(result)}")
                    results[data_type] = None
                else:
                    results[data_type] = result
                    success_count += 1
                    
            print(f"✅ {success_count}/{len(data_types)} metrics fetched successfully")
                    
        except asyncio.TimeoutError:
            print("⚠️ Parallel requests timed out - some data may be missing")
            for data_type in data_types:
                results[data_type] = None
        except Exception as e:
            print(f"⚠️ Parallel fetch error: {str(e)}")
            for data_type in data_types:
                results[data_type] = None
    
    return results

async def fetch_google_fit_with_client(
    client: httpx.AsyncClient,
    token: str,
    data_type: str,
    last_sync_timestamp: int,
    current_time_millis: int
):
    """Optimized fetch using shared client to ensure true parallelism."""
    try:
        # Use correct data source IDs according to Google Fit API documentation
        # For metrics that may not be available to all users, omit dataSourceId to use all available sources
        # This prevents 403 errors when specific datasources don't exist
        data_source_mapping = {
            # Common activity metrics - use specific merged datasources
            "com.google.step_count.delta": "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
            "com.google.calories.expended": "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended",
            "com.google.distance.delta": "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
            "com.google.sleep.segment": "derived:com.google.sleep.segment:com.google.android.gms:merged",
            # For health metrics that may not be available, omit dataSourceId to use all available sources
            # This prevents 403 "datasource not found" errors
            "com.google.heart_rate.bpm": None,  # User may not have heart rate data
            "com.google.blood_pressure": None,
            "com.google.blood_glucose": None,
            "com.google.oxygen_saturation": None,
            "com.google.body.temperature": None
        }
        
        data_source_id = data_source_mapping.get(data_type, data_type)
        
        # Ensure a minimum window per data type to avoid empty buckets
        # Defaults: 30 minutes; Sleep needs a longer lookback
        min_windows = {
            "com.google.sleep.segment": 36 * 60 * 60 * 1000,  # 36 hours
        }
        default_min_window = 30 * 60 * 1000  # 30 minutes
        min_window_ms = min_windows.get(data_type, default_min_window)
        
        # Effective start: ensure at least the minimum window
        effective_start = min(last_sync_timestamp, current_time_millis - min_window_ms)
        if current_time_millis - last_sync_timestamp < min_window_ms:
            effective_start = current_time_millis - min_window_ms
        
        # Bucket sizing: finer buckets for short windows; coarser for sleep
        bucket_by_time = 60000 if data_type != "com.google.sleep.segment" else 600000
        
        # Build aggregateBy array based on whether we have a specific data source
        if data_source_id:
            aggregate_by = [{
                "dataTypeName": data_type,
                "dataSourceId": data_source_id
            }]
        else:
            # For sensitive health data, omit dataSourceId to use all available sources
            aggregate_by = [{
                "dataTypeName": data_type
            }]
        
        body = {
            "aggregateBy": aggregate_by,
            "bucketByTime": {"durationMillis": bucket_by_time},
            "startTimeMillis": int(effective_start),
            "endTimeMillis": int(current_time_millis)
        }
        
        request_start = asyncio.get_event_loop().time()
        
        # Log detailed time range for debugging
        start_dt = datetime.fromtimestamp(effective_start / 1000).strftime('%Y-%m-%d %H:%M:%S')
        end_dt = datetime.fromtimestamp(current_time_millis / 1000).strftime('%Y-%m-%d %H:%M:%S')
        
        if data_source_id:
            print(f"🔄 [{request_start:.2f}] Starting {data_type} from {data_source_id}")
            print(f"   ⏰ Time range: {start_dt} to {end_dt}")
        else:
            print(f"🔄 [{request_start:.2f}] Starting {data_type} (all available sources)")
            print(f"   ⏰ Time range: {start_dt} to {end_dt}")
        
        r = await client.post(
            GOOGLE_FIT_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            json=body
        )
        
        # Handle specific HTTP status codes
        if r.status_code == 403:
            # Try to get more specific error information
            try:
                error_data = r.json()
                error_message = error_data.get('error', {}).get('message', 'Unknown error')
                
                # Check if this is a datasource not found error
                if 'datasource' in error_message.lower() or 'not found' in error_message.lower():
                    print(f"⚠️ Google Fit: {data_type} datasource not available for this user (common for health metrics)")
                else:
                    print(f"⚠️ Google Fit API 403 for {data_type}: {error_message}")
            except:
                print(f"⚠️ Google Fit API 403 for {data_type} - Access denied or datasource unavailable")
            
            # This is normal for health metrics that user doesn't track
            # Return empty data instead of None to indicate successful fetch with no data
            return []
        elif r.status_code == 401:
            print(f"⚠️ Google Fit API unauthorized for {data_type} - token may be expired")
            return None
        elif r.status_code == 429:
            print(f"⚠️ Google Fit API rate limited for {data_type}")
            return None
        elif r.status_code == 400:
            print(f"⚠️ Google Fit API bad request for {data_type} - data type may not be supported")
            return None

        r.raise_for_status()
        data = r.json()
        
        # Extract meaningful data from Google Fit response
        if "bucket" in data and data["bucket"]:
            all_points = []
            for bucket in data["bucket"]:
                if "dataset" in bucket and bucket["dataset"]:
                    for dataset in bucket["dataset"]:
                        if "point" in dataset and dataset["point"]:
                            all_points.extend(dataset["point"])
            
            request_end = asyncio.get_event_loop().time()
            duration = request_end - request_start
            print(f"✅ [{request_end:.2f}] {data_type}: {len(all_points)} data points ({duration:.2f}s)")
            
            # Debug: Show sample data points for steps to help diagnose issues
            if data_type == "com.google.step_count.delta" and all_points:
                print(f"   📊 Sample step data (first 3 points):")
                for i, point in enumerate(all_points[:3]):
                    values = point.get("value", [])
                    step_value = values[0].get("intVal", 0) if values else 0
                    start_time = point.get("startTimeNanos", 0)
                    start_dt = datetime.fromtimestamp(int(start_time) / 1e9).strftime('%Y-%m-%d %H:%M:%S') if start_time else "N/A"
                    print(f"      Point {i+1}: {step_value} steps at {start_dt}")
            
            return all_points
        request_end = asyncio.get_event_loop().time()
        duration = request_end - request_start
        print(f"⚠️ [{request_end:.2f}] {data_type}: No data found ({duration:.2f}s)")
        
        # Debug: If steps data is empty, show the response structure
        if data_type == "com.google.step_count.delta":
            print(f"   🔍 Empty response structure - bucket count: {len(data.get('bucket', []))}")
            if data.get("bucket"):
                for i, bucket in enumerate(data["bucket"][:2]):  # Show first 2 buckets
                    dataset_count = len(bucket.get("dataset", []))
                    print(f"      Bucket {i+1}: {dataset_count} datasets")
                    if bucket.get("dataset"):
                        for j, dataset in enumerate(bucket["dataset"][:2]):
                            point_count = len(dataset.get("point", []))
                            print(f"         Dataset {j+1}: {point_count} points")
        
        return []
        
    except httpx.TimeoutException:
        print(f"⚠️ Google Fit API timeout for {data_type} - request took too long")
        return None
    except httpx.HTTPStatusError as e:
        print(f"⚠️ Google Fit API HTTP error for {data_type}: {e.response.status_code}")
        return None
    except httpx.ConnectError:
        print(f"⚠️ Google Fit API connection error for {data_type} - network issue")
        return None
    except Exception as e:
        print(f"⚠️ Google Fit API unexpected error for {data_type}: {str(e)}")
        return None

def _handle_circuit_breaker_failure(cb: dict, current_time: float):
    """Handle circuit breaker failure logic."""
    cb["failure_count"] += 1
    cb["last_failure_time"] = current_time

    if cb["failure_count"] >= cb["failure_threshold"]:
        cb["state"] = "open"
        print(f"🔒 Circuit breaker OPENED after {cb['failure_count']} failures")

# -----------------------
# Fitbit rate limiting & caching
# -----------------------
# Cap concurrent Fitbit requests across the process (avoid burst 429s)
_fitbit_request_semaphore = asyncio.Semaphore(int(os.getenv("FITBIT_MAX_CONCURRENCY", "2")))
# Simple in-memory cache per endpoint+token fingerprint to reduce duplicate calls
_FITBIT_CACHE_TTL_SECONDS = int(os.getenv("FITBIT_CACHE_TTL", "30"))
_fitbit_cache: Dict[str, Dict[str, Any]] = {}

def _fitbit_cache_key(token: str, endpoint: str) -> str:
    # Token fingerprint to avoid mixing users; keep lightweight
    tf = token[:8] if token else "anon"
    return f"{tf}:{endpoint}"

async def _fitbit_get_with_limits(client: httpx.AsyncClient, token: str, endpoint: str) -> tuple[Any, int]:
    """Get Fitbit endpoint with global concurrency cap, small TTL cache, and retry/backoff.
    Returns (data_or_none, status_code).
    """
    # Circuit breaker: fast-fail if OPEN
    now = time.time()
    if fitbit_breaker["state"] == "open":
        last_t = fitbit_breaker["last_failure_time"] or 0
        if now - last_t < fitbit_breaker["recovery_timeout"]:
            # Mark health degraded and skip call
            api_health_status["fitbit"]["status"] = "degraded"
            api_health_status["fitbit"]["last_check"] = datetime.utcnow().isoformat()
            return None, 429
        else:
            # move to half_open
            fitbit_breaker["state"] = "half_open"

    ck = _fitbit_cache_key(token, endpoint)
    cached = _fitbit_cache.get(ck)
    if cached and cached.get("exp", 0) > now:
        return cached.get("data"), cached.get("status", 200)

    async with _fitbit_request_semaphore:
        max_attempts = 3 if fitbit_breaker["state"] != "half_open" else 1
        delay = 0.5
        for attempt in range(1, max_attempts + 1):
            try:
                resp = await client.get(
                    f"{FITBIT_URL}{endpoint}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                status = resp.status_code
                if status == 404:
                    _fitbit_cache[ck] = {"exp": time.time() + _FITBIT_CACHE_TTL_SECONDS, "data": None, "status": 404}
                    api_health_status["fitbit"]["status"] = "ok"
                    api_health_status["fitbit"]["last_check"] = datetime.utcnow().isoformat()
                    # Successful reach even if metric missing: reset breaker
                    fitbit_breaker["failure_count"] = 0
                    if fitbit_breaker["state"] == "half_open":
                        fitbit_breaker["state"] = "closed"
                    return None, 404
                if status == 429:
                    ra = resp.headers.get("Retry-After")
                    try:
                        wait_s = float(ra) if ra and ra.strip().isdigit() else delay
                    except Exception:
                        wait_s = delay
                    print(f"⚠️ Fitbit 429 for {endpoint}; retrying in {wait_s:.2f}s (attempt {attempt}/{max_attempts})")
                    await asyncio.sleep(wait_s)
                    delay *= 2
                    fitbit_breaker["failure_count"] += 1
                    fitbit_breaker["last_failure_time"] = time.time()
                    if fitbit_breaker["failure_count"] >= fitbit_breaker["failure_threshold"]:
                        fitbit_breaker["state"] = "open"
                        print("🔒 Fitbit circuit breaker OPENED due to repeated 429s")
                        api_health_status["fitbit"]["status"] = "degraded"
                    continue
                if 500 <= status < 600:
                    print(f"⚠️ Fitbit {status} for {endpoint}; retrying in {delay:.2f}s (attempt {attempt}/{max_attempts})")
                    await asyncio.sleep(delay)
                    delay *= 2
                    fitbit_breaker["failure_count"] += 1
                    fitbit_breaker["last_failure_time"] = time.time()
                    if fitbit_breaker["failure_count"] >= fitbit_breaker["failure_threshold"]:
                        fitbit_breaker["state"] = "open"
                        print("🔒 Fitbit circuit breaker OPENED due to repeated 5xx")
                        api_health_status["fitbit"]["status"] = "degraded"
                    continue

                resp.raise_for_status()
                data = resp.json()
                _fitbit_cache[ck] = {"exp": time.time() + _FITBIT_CACHE_TTL_SECONDS, "data": data, "status": status}
                api_health_status["fitbit"]["status"] = "ok"
                api_health_status["fitbit"]["last_check"] = datetime.utcnow().isoformat()
                # Success -> reset breaker
                fitbit_breaker["failure_count"] = 0
                if fitbit_breaker["state"] == "half_open":
                    fitbit_breaker["state"] = "closed"
                return data, status
            except httpx.TimeoutException:
                print(f"⚠️ Fitbit API timeout for {endpoint}; retrying in {delay:.2f}s (attempt {attempt}/{max_attempts})")
                await asyncio.sleep(delay)
                delay *= 2
                fitbit_breaker["failure_count"] += 1
                fitbit_breaker["last_failure_time"] = time.time()
            except httpx.HTTPStatusError as e:
                code = e.response.status_code if e.response is not None else 500
                if 400 <= code < 500 and code != 429:
                    print(f"⚠️ Fitbit API error {code} for {endpoint}")
                    _fitbit_cache[ck] = {"exp": time.time() + _FITBIT_CACHE_TTL_SECONDS, "data": None, "status": code}
                    api_health_status["fitbit"]["status"] = "ok"  # reachable
                    api_health_status["fitbit"]["last_check"] = datetime.utcnow().isoformat()
                    # Do not trip breaker for non-retriable 4xx
                    return None, code
                # Other statuses handled above
            except Exception as e:
                print(f"⚠️ Fitbit API error for {endpoint}: {str(e)}")
                await asyncio.sleep(delay)
                delay *= 2
                fitbit_breaker["failure_count"] += 1
                fitbit_breaker["last_failure_time"] = time.time()
        return None, 503

async def fetch_fitbit(token: str, endpoint: str):
    """Fetch data from Fitbit API with proper error handling."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:  # 10 second timeout
            data, status = await _fitbit_get_with_limits(client, token, endpoint)
            if status and 200 <= status < 300:
                return data
            return None
    except Exception as e:
        print(f"⚠️ Fitbit API error for {endpoint}: {str(e)}")
        return None

async def _fetch_fitbit_with_status(client: httpx.AsyncClient, token: str, endpoint: str):
    """Low-level fetch that returns (data, status_code)."""
    try:
        data, status = await _fitbit_get_with_limits(client, token, endpoint)
        return data, status
    except Exception as e:
        print(f"⚠️ Fitbit API error for {endpoint}: {str(e)}")
        return None, 500

async def refresh_fitbit_access_token(user_object_id, user_doc) -> str:
    """Refresh Fitbit access token using the stored refresh token; update DB; return new access token or empty string on failure."""
    try:
        refresh_token = user_doc.get("refresh_token")
        if not refresh_token:
            print("⚠️ No Fitbit refresh_token stored for user; cannot refresh")
            return ""

        client_id = os.getenv("FITBIT_CLIENT_ID")
        client_secret = os.getenv("FITBIT_CLIENT_SECRET")
        if not client_id or not client_secret:
            print("⚠️ Missing FITBIT_CLIENT_ID/SECRET; cannot refresh token")
            return ""

        basic_auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                f"{FITBIT_URL}/oauth2/token",
                headers={
                    "Authorization": f"Basic {basic_auth}",
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token
                }
            )
            if r.status_code != 200:
                try:
                    err = r.json()
                except Exception:
                    err = {"error": r.text}
                print(f"❌ Fitbit token refresh failed: {r.status_code} {err}")
                return ""

            token_data = r.json()
            new_access_token = token_data.get("access_token", "")
            new_refresh_token = token_data.get("refresh_token") or refresh_token
            expires_in = token_data.get("expires_in", 3600)

            try:
                db.users.update_one(
                    {"_id": user_object_id},
                    {"$set": {
                        "access_token": new_access_token,
                        "refresh_token": new_refresh_token,
                        "token_expires_at": datetime.utcnow() + timedelta(seconds=expires_in),
                        "updated_at": datetime.utcnow()
                    }}
                )
            except Exception as e:
                print(f"⚠️ Failed to persist refreshed Fitbit token: {e}")

            print("🔄 Fitbit access token refreshed")
            return new_access_token
    except Exception as e:
        print(f"⚠️ Unexpected error refreshing Fitbit token: {str(e)}")
        return ""

async def refresh_google_access_token(user_object_id, user_doc) -> str:
    """Refresh Google access token using the stored refresh token; update DB; return new access token or empty string on failure."""
    try:
        refresh_token = user_doc.get("refresh_token")
        if not refresh_token:
            print("⚠️ No Google refresh_token stored for user; cannot refresh")
            return ""

        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        if not client_id or not client_secret:
            print("⚠️ Missing GOOGLE_CLIENT_ID/SECRET; cannot refresh token")
            return ""

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                GOOGLE_TOKEN_URL,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                }
            )
            if r.status_code != 200:
                try:
                    err = r.json()
                except Exception:
                    err = {"error": r.text}
                print(f"❌ Google token refresh failed: {r.status_code} {err}")
                return ""

            token_data = r.json()
            new_access_token = token_data.get("access_token", "")
            expires_in = token_data.get("expires_in", 3600)

            try:
                db.users.update_one(
                    {"_id": user_object_id},
                    {"$set": {
                        "access_token": new_access_token,
                        "token_expires_at": datetime.utcnow() + timedelta(seconds=expires_in),
                        "updated_at": datetime.utcnow()
                    }}
                )
            except Exception as e:
                print(f"⚠️ Failed to persist refreshed Google token: {e}")

            print("🔄 Google access token refreshed")
            return new_access_token
    except Exception as e:
        print(f"⚠️ Unexpected error refreshing Google token: {str(e)}")
        return ""

def generate_mock_data():
    """Generate fake but realistic data for Form users."""
    return {
        "steps": random.randint(50, 150),
        "heart_rate": random.randint(60, 100),
        "calories": random.randint(5, 15),
        "distance": round(random.uniform(0.05, 0.2), 2),
        "blood_pressure": f"{random.randint(110,130)}/{random.randint(70,85)}",
        "blood_glucose": random.randint(80, 120),
        "oxygen_saturation": random.randint(95, 99),
        "body_temperature": round(random.uniform(36.5, 37.2), 1),
        "sleep": random.choice(["light", "deep", "rem"])
    }

# -----------------------
# Health Check Endpoint
# -----------------------

@router.get("/health")
async def health_check():
    """Check the health status of external APIs."""
    return {
        "status": "healthy",
        "apis": api_health_status,
        "circuit_breaker": circuit_breaker,
        "cache_stats": {
            "cached_requests": 0,
            "cache_duration": 0
        },
        "timestamp": datetime.utcnow().isoformat()
    }

# -----------------------
# Connection Status Endpoint
# -----------------------

@router.get("/status")
async def connection_status(user_id: str = Depends(get_current_user_id)):
    """Return whether the current user is connected to Google Fit or Fitbit."""
    from bson import ObjectId
    try:
        try:
            user_object_id = ObjectId(user_id)
        except Exception:
            raise HTTPException(400, "Invalid user ID format")

        user = db.users.find_one({"_id": user_object_id})
        if not user:
            raise HTTPException(404, "User not found")

        # Check for health service connection (separate from auth_provider)
        health_service_provider = user.get("health_service_provider")
        auth_provider = user.get("auth_provider", "form")
        
        # For users who authenticated with Google/Fitbit directly, use auth_provider
        # For form users who connected health services, use health_service_provider
        if auth_provider in ["google", "fitbit"]:
            is_connected = bool(user.get("access_token"))
            provider = auth_provider
        else:
            # Form user with connected health service
            is_connected = health_service_provider in ["google", "fitbit"] and bool(user.get("access_token"))
            provider = health_service_provider if is_connected else None
            
        return {
            "connected": is_connected,
            "provider": provider,
            "auth_provider": auth_provider,  # Include original auth method for debugging
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"⚠️ Error in connection_status: {e}")
        # Be safe; report not connected on error
        return {"connected": False, "provider": None}

# -----------------------
# Main Endpoint
# -----------------------

@router.get("/metrics")
async def get_metrics(user_id: str = Depends(get_current_user_id)):
    try:
        # No caching - always fetch fresh data for realtime
        current_time = datetime.utcnow().timestamp()
        
        # Convert string user_id to ObjectId for database query
        from bson import ObjectId
        try:
            user_object_id = ObjectId(user_id)
        except Exception:
            raise HTTPException(400, "Invalid user ID format")
        
        user = db.users.find_one({"_id": user_object_id})
        if not user:
            raise HTTPException(404, "User not found")

        # Determine the health service provider (separate from auth_provider)
        auth_provider = user.get("auth_provider", "form")
        health_service_provider = user.get("health_service_provider")
        
        # For users who authenticated with Google/Fitbit directly, use auth_provider
        # For form users who connected health services, use health_service_provider
        if auth_provider in ["google", "fitbit"]:
            provider = auth_provider
        else:
            provider = health_service_provider
            
        token = user.get("access_token")  # stored after login

        if provider == "google":
            # Check circuit breaker state first
            cb = circuit_breaker["google_fit"]
            current_time = datetime.utcnow().timestamp()
            
            if cb["state"] == "open" and current_time - cb["last_failure_time"] < cb["recovery_timeout"]:
                print("🔒 Circuit breaker OPEN - returning fallback data")
                fallback_result = {
                    "steps": 0,
                    "heart_rate": 0,
                    "calories": 0,
                    "distance": 0,
                    "blood_pressure": "120/80",
                    "blood_glucose": 0,
                    "oxygen_saturation": 0,
                    "body_temperature": 0,
                    "sleep": "light",
                }
                return fallback_result
            
            # Proactively refresh Google token if near expiry
            try:
                token_expires_at = user.get("token_expires_at")
                needs_refresh = False
                if token_expires_at:
                    if isinstance(token_expires_at, str):
                        try:
                            token_expires_at_dt = datetime.fromisoformat(token_expires_at)
                        except Exception:
                            token_expires_at_dt = None
                    else:
                        token_expires_at_dt = token_expires_at
                    if token_expires_at_dt:
                        remaining = (token_expires_at_dt - datetime.utcnow()).total_seconds()
                        needs_refresh = remaining <= 120
                if token and (needs_refresh or not token_expires_at):
                    new_token = await refresh_google_access_token(user_object_id, user)
                    if new_token:
                        token = new_token
            except Exception as e:
                print(f"⚠️ Could not evaluate/refresh Google token: {e}")
            
            # Define data types to fetch (prioritize most important and commonly available ones first)
            data_types = [
                "com.google.step_count.delta",           # Steps (most common)
                "com.google.heart_rate.bpm",             # Heart rate (common)
                "com.google.calories.expended",          # Calories (common)
                "com.google.distance.delta",             # Distance (common)
                "com.google.sleep.segment",              # Sleep (common)
                # Sensitive health data (less common, may require additional permissions)
                "com.google.blood_pressure",             # Blood pressure (rare)
                "com.google.blood_glucose",              # Blood glucose (rare)
                "com.google.oxygen_saturation",          # Oxygen saturation (rare)
                "com.google.body.temperature"            # Body temperature (rare)
            ]
            
            # Fetch all data in parallel for maximum speed
            print(f"🔄 Fetching Google Fit data for {len(data_types)} metrics in parallel...")
            
            # Use parallel fetch instead of batching
            results = await parallel_fetch_google_fit(token, data_types)
            
            # Extract individual results
            steps_data = results.get("com.google.step_count.delta")
            heart_rate_data = results.get("com.google.heart_rate.bpm")
            calories_data = results.get("com.google.calories.expended")
            distance_data = results.get("com.google.distance.delta")
            blood_pressure_data = results.get("com.google.blood_pressure")
            blood_glucose_data = results.get("com.google.blood_glucose")
            oxygen_saturation_data = results.get("com.google.oxygen_saturation")
            body_temperature_data = results.get("com.google.body.temperature")
            sleep_data = results.get("com.google.sleep.segment")
            
            # Process the received data
            
            # Process Google Fit data and extract meaningful values
            def process_google_fit_data(data, data_type="", default_value=0):
                if not data or not isinstance(data, list):
                    return default_value
                
                # For cumulative data (steps, calories, distance), sum all values
                # For instantaneous data (heart rate, temperature), average the values
                cumulative_data_types = [
                    "com.google.step_count.delta",
                    "com.google.calories.expended", 
                    "com.google.distance.delta"
                ]
                
                is_cumulative = data_type in cumulative_data_types
                total_value = 0
                count = 0
                
                for point in data:
                    if "value" in point and point["value"]:
                        for value in point["value"]:
                            if "intVal" in value:
                                total_value += value["intVal"]
                                count += 1
                            elif "fpVal" in value:
                                total_value += value["fpVal"]
                                count += 1
                
                if count > 0:
                    if is_cumulative:
                        # For cumulative data, return the sum
                        return int(total_value) if isinstance(total_value, float) and total_value.is_integer() else total_value
                    else:
                        # For instantaneous data, return the average
                        return round(total_value / count, 1) if isinstance(total_value, float) else total_value
                
                return default_value
            
            def process_blood_pressure_data(data):
                if not data or not isinstance(data, list):
                    return "120/80"
                
                # Extract systolic and diastolic values
                for point in data:
                    if "value" in point and point["value"]:
                        values = point["value"]
                        if len(values) >= 2:
                            systolic = values[0].get("fpVal", 120)
                            diastolic = values[1].get("fpVal", 80)
                            return f"{int(systolic)}/{int(diastolic)}"
                return "120/80"
            
            # Process data with smart fallbacks for restricted scopes
            def get_fallback_value(data_type: str, data: Any, default_value: Any = 0) -> Any:
                """Get value with appropriate fallback based on data type."""
                if data is not None and len(data) > 0:
                    if data_type == "com.google.blood_pressure":
                        return process_blood_pressure_data(data)
                    else:
                        processed_value = process_google_fit_data(data, data_type, default_value)
                        # Return processed value if it's not None (0 is a valid value!)
                        if processed_value is not None:
                            return processed_value
                
                # Provide realistic fallbacks for different data types
                fallbacks = {
                    "com.google.step_count.delta": 0,
                    "com.google.heart_rate.bpm": 0,
                    "com.google.calories.expended": 0,
                    "com.google.distance.delta": 0,
                    "com.google.blood_pressure": "120/80",
                    "com.google.blood_glucose": 0,
                    "com.google.oxygen_saturation": 0,
                    "com.google.body.temperature": 0,
                    "com.google.sleep.segment": "light"
                }
                
                return fallbacks.get(data_type, default_value)
            
            result = {
                "steps": get_fallback_value("com.google.step_count.delta", steps_data, 0),
                "heart_rate": get_fallback_value("com.google.heart_rate.bpm", heart_rate_data, 0),
                "calories": get_fallback_value("com.google.calories.expended", calories_data, 0),
                "distance": get_fallback_value("com.google.distance.delta", distance_data, 0),
                "blood_pressure": get_fallback_value("com.google.blood_pressure", blood_pressure_data, "120/80"),
                "blood_glucose": get_fallback_value("com.google.blood_glucose", blood_glucose_data, 0),
                "oxygen_saturation": get_fallback_value("com.google.oxygen_saturation", oxygen_saturation_data, 0),
                "body_temperature": get_fallback_value("com.google.body.temperature", body_temperature_data, 0),
                "sleep": get_fallback_value("com.google.sleep.segment", sleep_data, "light"),
            }
            
            # Log successful data retrieval
            print(
                f"📊 Metrics retrieved: "
                f"Steps={result['steps']}, "
                f"HeartRate={result['heart_rate']}, "
                f"Calories={result['calories']}, "
                f"Distance={result['distance']}, "
                f"BloodPressure={result['blood_pressure']}, "
                f"BloodGlucose={result['blood_glucose']}, "
                f"OxygenSaturation={result['oxygen_saturation']}, "
                f"BodyTemperature={result['body_temperature']}, "
                f"Sleep={result['sleep']}"
            )
            
            # Update last sync timestamp for incremental fetching
            # Note: We intentionally set this to start of today to ensure we always re-fetch today's data
            # This is necessary because Google Fit data can arrive with delays
            try:
                today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
                today_start_millis = int(today_start.timestamp() * 1000)
                
                # Always set to start of today to ensure fresh data on next fetch
                db.users.update_one(
                    {"_id": user_object_id},
                    {"$set": {"last_sync_timestamp": today_start_millis}}
                )
                print(f"🔄 Sync timestamp updated to start of today for next fetch")
            except Exception as e:
                print(f"⚠️ Failed to update sync timestamp: {e}")
            
            # Return fresh data (no caching for realtime)
            print(f"✅ Fresh data fetched for user {user_id}")
            return result

        elif provider == "fitbit":
            today = datetime.utcnow().strftime("%Y-%m-%d")
            # Proactively refresh token if expired or near expiry (<= 2 minutes)
            token_expires_at = user.get("token_expires_at")
            try:
                from bson import ObjectId
                needs_refresh = False
                if token_expires_at:
                    if isinstance(token_expires_at, str):
                        try:
                            token_expires_at_dt = datetime.fromisoformat(token_expires_at)
                        except Exception:
                            token_expires_at_dt = None
                    else:
                        token_expires_at_dt = token_expires_at
                    if token_expires_at_dt:
                        remaining = (token_expires_at_dt - datetime.utcnow()).total_seconds()
                        needs_refresh = remaining <= 120
                if token and (needs_refresh or not token_expires_at):
                    user_object_id_ref = ObjectId(user_id)
                    new_token = await refresh_fitbit_access_token(user_object_id_ref, user)
                    if new_token:
                        token = new_token
            except Exception as e:
                print(f"⚠️ Could not evaluate/refresh Fitbit token: {e}")

            endpoints = {
                "steps": f"/1/user/-/activities/steps/date/{today}/1d/1min.json",
                "heart_rate": f"/1/user/-/activities/heart/date/{today}/1d/1min.json",
                "calories": f"/1/user/-/activities/calories/date/{today}/1d/1min.json",
                "distance": f"/1/user/-/activities/distance/date/{today}/1d/1min.json",
                "blood_pressure": f"/1/user/-/body/blood-pressure/date/{today}.json",
                "blood_glucose": f"/1/user/-/body/glucose/date/{today}.json",
                "oxygen_saturation": f"/1/user/-/spo2/date/{today}.json",
                "body_temperature": f"/1/user/-/temp/skin/date/{today}.json",
                "sleep": f"/1.2/user/-/sleep/date/{today}.json",
            }

            results: Dict[str, Any] = {}
            statuses: Dict[str, int] = {}

            async with httpx.AsyncClient(
                timeout=15.0,
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=10),
                http2=True
            ) as client:
                # Batched fetching with small concurrency and rate-limit backoff
                keys = list(endpoints.keys())
                batch_size = 3  # limit concurrency to avoid 429
                base_delay = 0.75  # seconds between retries

                async def process_batch(batch_keys: list, current_token: str):
                    nonlocal token
                    # first attempt for the whole batch
                    batch_tasks = {k: asyncio.create_task(_fetch_fitbit_with_status(client, current_token, endpoints[k])) for k in batch_keys}
                    batch_results = await asyncio.gather(*batch_tasks.values(), return_exceptions=True)
                    for (k, _), res in zip(batch_tasks.items(), batch_results):
                        if isinstance(res, Exception):
                            print(f"⚠️ Fitbit fetch error for {k}: {str(res)}")
                            results[k], statuses[k] = None, 500
                        else:
                            results[k], statuses[k] = res

                    # handle 401 once per batch: refresh and retry only 401s
                    if any(statuses.get(k) == 401 for k in batch_keys):
                        try:
                            from bson import ObjectId
                            refreshed = await refresh_fitbit_access_token(ObjectId(user_id), user)
                            if refreshed:
                                token = refreshed
                                retry_401 = [k for k in batch_keys if statuses.get(k) == 401]
                                retry_tasks = {k: asyncio.create_task(_fetch_fitbit_with_status(client, token, endpoints[k])) for k in retry_401}
                                retry_results = await asyncio.gather(*retry_tasks.values(), return_exceptions=True)
                                for (k, _), res in zip(retry_tasks.items(), retry_results):
                                    if isinstance(res, Exception):
                                        results[k], statuses[k] = None, 500
                                    else:
                                        results[k], statuses[k] = res
                        except Exception as e:
                            print(f"⚠️ Fitbit refresh failed for batch {batch_keys}: {e}")

                    # handle 429 with exponential backoff (max 2 retries)
                    backoff = base_delay
                    max_retries = 2
                    attempt = 0
                    while attempt < max_retries and any(statuses.get(k) == 429 for k in batch_keys):
                        await asyncio.sleep(backoff)
                        retry_429 = [k for k in batch_keys if statuses.get(k) == 429]
                        retry_tasks = {k: asyncio.create_task(_fetch_fitbit_with_status(client, token, endpoints[k])) for k in retry_429}
                        retry_results = await asyncio.gather(*retry_tasks.values(), return_exceptions=True)
                        for (k, _), res in zip(retry_tasks.items(), retry_results):
                            if isinstance(res, Exception):
                                results[k], statuses[k] = None, 500
                            else:
                                results[k], statuses[k] = res
                        backoff *= 2  # exponential
                        attempt += 1

                # Iterate through batches with a short spacing to reduce bursts
                for i in range(0, len(keys), batch_size):
                    batch_keys = keys[i:i + batch_size]
                    await process_batch(batch_keys, token)
                    if i + batch_size < len(keys):
                        await asyncio.sleep(0.2)

            # Extract simple primitives from Fitbit payloads
            def extract_steps(v: Any) -> int:
                try:
                    if isinstance(v, dict):
                        ts = v.get("activities-steps")
                        if isinstance(ts, list) and ts:
                            last = ts[-1]
                            return int(float(last.get("value", 0)))
                    return int(v) if isinstance(v, (int, float)) else 0
                except Exception:
                    return 0

            def extract_heart_rate(v: Any) -> int:
                try:
                    if isinstance(v, dict):
                        arr = v.get("activities-heart")
                        if isinstance(arr, list) and arr:
                            val = arr[-1].get("value")
                            if isinstance(val, dict) and "restingHeartRate" in val:
                                return int(val.get("restingHeartRate", 0))
                    return int(v) if isinstance(v, (int, float)) else 0
                except Exception:
                    return 0

            def extract_calories(v: Any) -> int:
                try:
                    if isinstance(v, dict):
                        ts = v.get("activities-calories")
                        if isinstance(ts, list) and ts:
                            last = ts[-1]
                            return int(float(last.get("value", 0)))
                    return int(v) if isinstance(v, (int, float)) else 0
                except Exception:
                    return 0

            def extract_distance(v: Any) -> float:
                try:
                    if isinstance(v, dict):
                        ts = v.get("activities-distance")
                        if isinstance(ts, list) and ts:
                            last = ts[-1]
                            return float(last.get("value", 0))
                    return float(v) if isinstance(v, (int, float)) else 0.0
                except Exception:
                    return 0.0

            def extract_spo2(v: Any) -> int:
                try:
                    if isinstance(v, dict):
                        val = v.get("value") or v.get("spo2")
                        if isinstance(val, (int, float)):
                            return int(val)
                    return int(v) if isinstance(v, (int, float)) else 0
                except Exception:
                    return 0

            def extract_skin_temp(v: Any) -> float:
                try:
                    if isinstance(v, dict):
                        val = v.get("tempSkin") or v.get("value")
                        if isinstance(val, (int, float)):
                            return float(val)
                    return float(v) if isinstance(v, (int, float)) else 0.0
                except Exception:
                    return 0.0

            def extract_sleep(v: Any) -> str:
                try:
                    if isinstance(v, dict):
                        summ = v.get("summary") or v.get("sleep", [{}])[0].get("levels", {}).get("summary") if v.get("sleep") else None
                        if isinstance(summ, dict):
                            minutes = 0
                            for k in ["deep", "light", "rem", "wake"]:
                                item = summ.get(k)
                                if isinstance(item, dict):
                                    minutes += int(item.get("minutes", 0))
                            hours = minutes // 60
                            mins = minutes % 60
                            if minutes > 0:
                                return f"{hours}h {mins}m"
                    if isinstance(v, (int, float)):
                        h = int(v) // 60
                        m = int(v) % 60
                        return f"{h}h {m}m"
                    return "light"
                except Exception:
                    return "light"

            def extract_bp(v: Any) -> str:
                try:
                    if isinstance(v, dict):
                        bp = v.get("bp") or v.get("value")
                        if isinstance(bp, list) and bp:
                            item = bp[-1]
                            sys = int(item.get("systolic", 120))
                            dia = int(item.get("diastolic", 80))
                            return f"{sys}/{dia}"
                    if isinstance(v, str):
                        return v
                    return "120/80"
                except Exception:
                    return "120/80"

            def extract_glucose(v: Any) -> int:
                try:
                    if isinstance(v, dict):
                        g = v.get("glucose") or v.get("value")
                        if isinstance(g, list) and g:
                            return int(g[-1].get("value", 0))
                    return int(v) if isinstance(v, (int, float)) else 0
                except Exception:
                    return 0

            # Map results to final values with graceful 404 and None fallbacks
            result = {
                "steps": extract_steps(results.get("steps")),
                "heart_rate": extract_heart_rate(results.get("heart_rate")),
                "calories": extract_calories(results.get("calories")),
                "distance": extract_distance(results.get("distance")),
                "blood_pressure": extract_bp(results.get("blood_pressure")),
                "blood_glucose": extract_glucose(results.get("blood_glucose")),
                "oxygen_saturation": extract_spo2(results.get("oxygen_saturation")),
                "body_temperature": extract_skin_temp(results.get("body_temperature")),
                "sleep": extract_sleep(results.get("sleep")),
            }
            
            # Return fresh data (no caching for realtime)
            print(f"✅ Fresh Fitbit data fetched for user {user_id}")
            return result

        else:  # form user or no health service connected
            # Check if form user has connected a health service
            if not token or not health_service_provider:
                raise HTTPException(400, "No health service connected. Please connect Google Fit to view real-time data.")
            
            # If they have a token but no health service provider, they might be in the middle of connecting
            # In this case, we should return an error asking them to complete the connection
            raise HTTPException(400, "Health service connection incomplete. Please complete the OAuth flow to view real-time data.")
    
    except Exception as e:
        # Log the error and return a safe fallback response
        print(f"❌ Error in get_metrics: {str(e)}")
        fallback_result = {
            "steps": 0,
            "heart_rate": 0,
            "calories": 0,
            "distance": 0,
            "blood_pressure": "120/80",
            "blood_glucose": 0,
            "oxygen_saturation": 0,
            "body_temperature": 0,
            "sleep": "light",
        }
        
        # Return fallback data (no caching for realtime)
        print(f"⚠️ Returning fallback data for user {user_id}")
        return fallback_result
