from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
import json
import re
from datetime import datetime, timedelta
from bson import ObjectId
from pymongo import DESCENDING, ASCENDING

from app.models.blog import (
    BlogPostIn, BlogPostOut, BlogAnalytics, AIInsights, TopicSuggestion,
    ViewsOverTimeData, EngagementByWeekData, CategoryData,
    GenerateOutlineRequest, OutlineResponse, GenerateContentRequest, ContentResponse,
    OptimizeTitleRequest, OptimizeTitleResponse, ImproveReadabilityRequest, ImproveReadabilityResponse,
    AdjustToneRequest, AdjustToneResponse, GenerateMetaRequest, GenerateMetaResponse,
    TranslateRequest, TranslateResponse, SummarizeRequest, SummarizeResponse,
    ImageSuggestionRequest, ImageSuggestionResponse, RegenerateSectionRequest, RegenerateSectionResponse,
    ContentAnalysisRequest, ContentAnalysisResponse,
    CommentIn, CommentOut, LikeRequest, LikeResponse, RelatedBlogsResponse
)
from app.database.connection import db
from app.auth.jwt_auth import get_current_user_id, get_current_user, verify_token
from app.ai_blog_agents.graph.suggestion_graph import BlogSuggestionGraph
from app.ai_blog_agents.graph.blog_generation_graph import BlogGenerationGraph
from app.ai_blog_agents.agents.engagement_agent import EngagementAgent
from app.ai_blog_agents.agents.blog_planner_agent import BlogPlannerAgent
from app.ai_blog_agents.agents.blog_writer_agent import generate_blog
from app.ai_blog_agents.agents.seo_optimizer_agent import optimize_blog
from app.ai_blog_agents.agents.summarizer_agent import summarize_blog
from app.ai_blog_agents.agents.translation_agent import TranslationAgent
from app.ai_blog_agents.agents.readability_agent import ReadabilityAgent
from app.ai_blog_agents.agents.tone_agent import ToneAgent
from app.ai_blog_agents.tools.image_suggestion_tool import generate_image_suggestions

router = APIRouter(prefix="/api/blog", tags=["Blog"])

# Initialize AI agents lazily to avoid import-time errors
_suggestion_graph = None
_engagement_agent = None
_blog_planner_agent = None
_blog_generation_graph = None
_translation_agent = None
_readability_agent = None
_tone_agent = None

def get_suggestion_graph():
    """Lazy initialization of suggestion graph"""
    global _suggestion_graph
    if _suggestion_graph is None:
        try:
            _suggestion_graph = BlogSuggestionGraph()
        except Exception as e:
            print(f"Warning: Failed to initialize BlogSuggestionGraph: {e}")
            # Return a mock object that returns empty results
            class MockSuggestionGraph:
                async def run(self, **kwargs):
                    return {"suggested_topics": [], "suggested_tags": [], "improvements": "", "insights": ""}
            _suggestion_graph = MockSuggestionGraph()
    return _suggestion_graph

def get_engagement_agent():
    """Lazy initialization of engagement agent"""
    global _engagement_agent
    if _engagement_agent is None:
        try:
            _engagement_agent = EngagementAgent()
        except Exception as e:
            print(f"Warning: Failed to initialize EngagementAgent: {e}")
            # Return a mock object that returns default results
            class MockEngagementAgent:
                async def run(self, input_data):
                    return {
                        "insights": "AI features unavailable. Please check configuration.",
                        "suggested_tags": [],
                        "improvements": "AI features are currently unavailable.",
                        "analytics": None
                    }
            _engagement_agent = MockEngagementAgent()
    return _engagement_agent

def get_blog_planner_agent():
    """Lazy initialization of blog planner agent"""
    global _blog_planner_agent
    if _blog_planner_agent is None:
        try:
            _blog_planner_agent = BlogPlannerAgent()
        except Exception as e:
            print(f"Warning: Failed to initialize BlogPlannerAgent: {e}")
            _blog_planner_agent = None
    return _blog_planner_agent

def get_translation_agent():
    """Lazy initialization of translation agent"""
    global _translation_agent
    if _translation_agent is None:
        try:
            _translation_agent = TranslationAgent()
        except Exception as e:
            print(f"Warning: Failed to initialize TranslationAgent: {e}")
            _translation_agent = None
    return _translation_agent

def get_readability_agent():
    """Lazy initialization of readability agent"""
    global _readability_agent
    if _readability_agent is None:
        try:
            _readability_agent = ReadabilityAgent()
        except Exception as e:
            print(f"Warning: Failed to initialize ReadabilityAgent: {e}")
            _readability_agent = None
    return _readability_agent

def get_tone_agent():
    """Lazy initialization of tone agent"""
    global _tone_agent
    if _tone_agent is None:
        try:
            _tone_agent = ToneAgent()
        except Exception as e:
            print(f"Warning: Failed to initialize ToneAgent: {e}")
            _tone_agent = None
    return _tone_agent

def get_blog_generation_graph():
    """Lazy initialization of blog generation graph"""
    global _blog_generation_graph
    if _blog_generation_graph is None:
        try:
            _blog_generation_graph = BlogGenerationGraph()
        except Exception as e:
            print(f"Warning: Failed to initialize BlogGenerationGraph: {e}")
            _blog_generation_graph = None
    return _blog_generation_graph

def _oid(val: str):
    """Convert string to ObjectId"""
    try:
        return ObjectId(val)
    except:
        return val

def _convert_objectids_to_strings(data):
    """Recursively convert ObjectIds to strings"""
    if isinstance(data, dict):
        return {k: _convert_objectids_to_strings(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_convert_objectids_to_strings(item) for item in data]
    elif isinstance(data, ObjectId):
        return str(data)
    elif isinstance(data, datetime):
        return data.isoformat()
    return data

def _get_user_profile_picture(user_id: str, user_doc: dict = None) -> str:
    """
    Helper function to resolve user profile picture based on auth provider.
    Centralizes the logic and improves performance by reusing user document if available.
    Handles hybrid users who may have multiple auth providers (e.g., form + Google health service).
    
    Args:
        user_id: The user's ID
        user_doc: Optional user document to avoid redundant database query
        
    Returns:
        Profile picture URL or None
    """
    try:
        # If user document not provided, fetch it
        if user_doc is None:
            user_doc = db.users.find_one({"_id": _oid(user_id)})
            if not user_doc:
                return None
        
        # First check if profile picture is directly in user document
        profile_picture = user_doc.get("profile_picture_url")
        if profile_picture and profile_picture.strip():
            return profile_picture.strip()
        
        # Check social_auth_data for any available profile pictures
        # This handles hybrid users (e.g., form users who connected Google/Fitbit)
        social_auth_data = user_doc.get("social_auth_data", {})
        
        # Try Google profile picture first (highest quality usually)
        if social_auth_data.get("google"):
            google_data = social_auth_data["google"]
            profile_picture = google_data.get("picture")
            if profile_picture and profile_picture.strip():
                return profile_picture.strip()
        
        # Try Fitbit avatar next
        if social_auth_data.get("fitbit"):
            fitbit_data = social_auth_data["fitbit"]
            profile_picture = (
                fitbit_data.get("avatar640") or 
                fitbit_data.get("avatar150") or 
                fitbit_data.get("avatar")
            )
            if profile_picture and profile_picture.strip():
                return profile_picture.strip()
        
        # Finally, for pure form users, check onboarding_step1 collection
        auth_provider = user_doc.get("auth_provider", "form")
        if auth_provider == "form":
            try:
                onboarding = db.onboarding_step1.find_one({"user_id": user_id})
                if onboarding:
                    profile_picture = onboarding.get("profile_picture_url")
                    if profile_picture and profile_picture.strip():
                        return profile_picture.strip()
            except Exception as onboarding_error:
                print(f"Warning: Error querying onboarding_step1 for user {user_id}: {onboarding_error}")
        
        return None
    except Exception as e:
        print(f"Warning: Error resolving profile picture for user {user_id}: {e}")
        return None

# -------------------------
# Blog Posts CRUD
# -------------------------

@router.get("/posts", response_model=Dict[str, Any])
async def get_blog_posts(
    status: Optional[str] = Query(None, description="Filter by status: draft or published"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in title and content"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    user_id: str = Depends(get_current_user_id)
):
    """Get user's blog posts with filters"""
    try:
        # Check database connection
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        query = {"user_id": user_id}
        
        if status:
            # Normalize status to lowercase for consistent filtering
            query["status"] = status.lower()
            print(f"[get_blog_posts] Filtering by status: {query['status']}")
        if category:
            query["category"] = category
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"content": {"$regex": search, "$options": "i"}},
                {"excerpt": {"$regex": search, "$options": "i"}}
            ]
        
        skip = (page - 1) * limit
        
        # Handle sorting - use created_at if it exists, otherwise use _id
        try:
            posts = list(db.blogs.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit))
        except Exception as sort_error:
            # Fallback to _id sorting if created_at doesn't exist
            print(f"Warning: Error sorting by created_at: {sort_error}. Using _id instead.")
            posts = list(db.blogs.find(query).sort("_id", DESCENDING).skip(skip).limit(limit))
        
        try:
            total = db.blogs.count_documents(query)
        except Exception as count_error:
            print(f"Warning: Error counting documents: {count_error}")
            total = len(posts)  # Fallback to count of returned posts
        
        # Convert ObjectIds and ensure proper structure
        processed_posts = []
        for post in posts:
            try:
                post = _convert_objectids_to_strings(post)
                if "_id" in post:
                    post["id"] = post.pop("_id")
                # Ensure imageUrl field exists
                if "image_url" in post and "imageUrl" not in post:
                    post["imageUrl"] = post.get("image_url")
                # Ensure required fields exist and normalize status
                if "status" not in post:
                    post["status"] = "draft"
                else:
                    # Normalize status to lowercase for consistency
                    post["status"] = post["status"].lower()
                if "views" not in post:
                    post["views"] = 0
                if "likes" not in post:
                    post["likes"] = 0
                if "comments" not in post:
                    post["comments"] = 0
                processed_posts.append(post)
            except Exception as post_error:
                print(f"Warning: Error processing post: {post_error}")
                continue  # Skip problematic posts
        
        return {
            "posts": processed_posts,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if limit > 0 else 1
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in get_blog_posts: {str(e)}")
        print(error_trace)
        # Return empty response instead of crashing
        return {
            "posts": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0
        }

@router.get("/public/posts", response_model=Dict[str, Any])
async def get_public_blog_posts(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in title and content"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Get all published blog posts from all users (public endpoint, no auth required)"""
    try:
        # Check database connection
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        # Only fetch published posts from all users
        query = {"status": "published"}
        
        if category:
            query["category"] = category
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"content": {"$regex": search, "$options": "i"}},
                {"excerpt": {"$regex": search, "$options": "i"}},
                {"tags": {"$regex": search, "$options": "i"}}
            ]
        
        skip = (page - 1) * limit
        
        # Sort by published_at or created_at, descending (newest first)
        try:
            posts = list(db.blogs.find(query).sort("published_at", DESCENDING).skip(skip).limit(limit))
        except Exception as sort_error:
            # Fallback to created_at if published_at doesn't exist
            try:
                posts = list(db.blogs.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit))
            except Exception:
                # Final fallback to _id
                posts = list(db.blogs.find(query).sort("_id", DESCENDING).skip(skip).limit(limit))
        
        try:
            total = db.blogs.count_documents(query)
        except Exception as count_error:
            print(f"Warning: Error counting documents: {count_error}")
            total = len(posts)
        
        # Convert ObjectIds and ensure proper structure
        processed_posts = []
        for post in posts:
            try:
                post = _convert_objectids_to_strings(post)
                if "_id" in post:
                    post["id"] = post.pop("_id")
                # Ensure imageUrl field exists
                if "image_url" in post and "imageUrl" not in post:
                    post["imageUrl"] = post.get("image_url")
                # Ensure required fields exist
                if "status" not in post:
                    post["status"] = "published"
                else:
                    post["status"] = post["status"].lower()
                if "views" not in post:
                    post["views"] = 0
                if "likes" not in post:
                    post["likes"] = 0
                if "comments" not in post:
                    post["comments"] = 0
                
                # Add author info by looking up user_id
                if "user_id" in post and post["user_id"]:
                    try:
                        user = db.users.find_one({"_id": _oid(post["user_id"])})
                        if user:
                            # Set author name
                            post["author_name"] = user.get("full_name", "Anonymous User")
                            post["author_email"] = user.get("email")
                            
                            # Get profile picture using helper function
                            post["author_image"] = _get_user_profile_picture(post["user_id"], user)
                    except Exception as user_error:
                        print(f"Warning: Error fetching author info for post {post.get('id')}: {user_error}")
                        post["author_name"] = "Anonymous User"
                        post["author_image"] = None
                
                processed_posts.append(post)
            except Exception as post_error:
                print(f"Warning: Error processing post: {post_error}")
                continue
        
        return {
            "posts": processed_posts,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if limit > 0 else 1
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in get_public_blog_posts: {str(e)}")
        print(error_trace)
        # Return empty response instead of crashing
        return {
            "posts": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "total_pages": 0
        }

@router.get("/public/posts/{post_id}", response_model=Dict[str, Any])
async def get_public_blog_post(
    post_id: str,
    increment_views: bool = Query(True, description="Whether to increment view count")
):
    """Get a single published blog post by ID (public endpoint, no auth required)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        post = db.blogs.find_one({"_id": _oid(post_id), "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Get current views
        current_views = post.get("views", 0)
        
        # Only increment views if requested (default True for backward compatibility)
        if increment_views:
            # Increment views atomically
            db.blogs.update_one({"_id": _oid(post_id)}, {"$inc": {"views": 1}})
            post["views"] = current_views + 1
        else:
            post["views"] = current_views
        
        post = _convert_objectids_to_strings(post)
        post["id"] = str(post.pop("_id"))
        if "image_url" in post and "imageUrl" not in post:
            post["imageUrl"] = post.get("image_url")
        if "status" not in post:
            post["status"] = "published"
        else:
            post["status"] = post["status"].lower()
        if "views" not in post:
            post["views"] = 0
        if "likes" not in post:
            post["likes"] = 0
        if "comments" not in post:
            post["comments"] = 0
        
        # Add author info by looking up user_id
        if "user_id" in post and post["user_id"]:
            try:
                user = db.users.find_one({"_id": _oid(post["user_id"])})
                if user:
                    post["author_name"] = user.get("full_name", "Anonymous User")
                    post["author_email"] = user.get("email")
                    
                    # Get profile picture using helper function
                    post["author_image"] = _get_user_profile_picture(post["user_id"], user)
            except Exception as user_error:
                print(f"Warning: Error fetching author info: {user_error}")
                post["author_name"] = "Anonymous User"
                post["author_image"] = None
        
        return post
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error fetching public blog post: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching blog post: {str(e)}")

@router.get("/posts/{post_id}", response_model=BlogPostOut)
async def get_blog_post(
    post_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Get a single blog post by ID (authenticated, for user's own posts)"""
    try:
        post = db.blogs.find_one({"_id": _oid(post_id), "user_id": user_id})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        post = _convert_objectids_to_strings(post)
        post["id"] = post.pop("_id")
        return BlogPostOut(**post)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching blog post: {str(e)}")

@router.post("/posts", response_model=BlogPostOut)
async def create_blog_post(
    post: BlogPostIn,
    user_id: str = Depends(get_current_user_id)
):
    """Create a new blog post"""
    try:
        post_data = post.dict()
        post_data["user_id"] = user_id
        post_data["views"] = 0
        post_data["likes"] = 0
        post_data["comments"] = 0
        post_data["shares"] = 0
        post_data["created_at"] = datetime.utcnow()
        post_data["updated_at"] = datetime.utcnow()
        
        # Ensure status is set and normalized
        if "status" not in post_data or not post_data["status"]:
            post_data["status"] = "draft"
        post_data["status"] = post_data["status"].lower()
        print(f"[create_blog_post] Creating post with status: {post_data['status']}")
        
        if post_data["status"] == "published":
            post_data["published_at"] = datetime.utcnow()
        
        # Calculate read time (average 200 words per minute)
        word_count = len(post_data.get("content", "").split())
        read_time_minutes = max(1, word_count // 200)
        post_data["read_time"] = f"{read_time_minutes} min"
        
        result = db.blogs.insert_one(post_data)
        post_data["id"] = str(result.inserted_id)
        post_data["_id"] = result.inserted_id
        
        return BlogPostOut(**post_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating blog post: {str(e)}")

@router.put("/posts/{post_id}", response_model=BlogPostOut)
async def update_blog_post(
    post_id: str,
    post: BlogPostIn,
    user_id: str = Depends(get_current_user_id)
):
    """Update a blog post"""
    try:
        existing = db.blogs.find_one({"_id": _oid(post_id), "user_id": user_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        update_data = post.dict()
        update_data["updated_at"] = datetime.utcnow()
        
        # Ensure status is normalized
        if "status" in update_data:
            update_data["status"] = update_data["status"].lower()
            print(f"[update_blog_post] Updating post with status: {update_data['status']}")
        
        # If status changed to published, set published_at
        if update_data.get("status") == "published" and existing.get("status") != "published":
            update_data["published_at"] = datetime.utcnow()
        
        # Recalculate read time
        word_count = len(update_data.get("content", "").split())
        read_time_minutes = max(1, word_count // 200)
        update_data["read_time"] = f"{read_time_minutes} min"
        
        db.blogs.update_one(
            {"_id": _oid(post_id), "user_id": user_id},
            {"$set": update_data}
        )
        
        updated = db.blogs.find_one({"_id": _oid(post_id)})
        updated = _convert_objectids_to_strings(updated)
        updated["id"] = updated.pop("_id")
        return BlogPostOut(**updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating blog post: {str(e)}")

@router.delete("/posts/{post_id}")
async def delete_blog_post(
    post_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """Delete a blog post"""
    try:
        result = db.blogs.delete_one({"_id": _oid(post_id), "user_id": user_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Blog post not found")
        return {"message": "Blog post deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting blog post: {str(e)}")

# -------------------------
# Analytics Helper Function
# -------------------------

async def _calculate_analytics(user_id: str) -> BlogAnalytics:
    """Calculate blog analytics for a user"""
    # Get all user's blogs
    all_blogs = list(db.blogs.find({"user_id": user_id}))
    
    total_blogs = len(all_blogs)
    total_views = sum(blog.get("views", 0) for blog in all_blogs)
    total_comments = sum(blog.get("comments", 0) for blog in all_blogs)
    total_likes = sum(blog.get("likes", 0) for blog in all_blogs)
    
    # Calculate average read time
    read_times = []
    for blog in all_blogs:
        read_time_str = blog.get("read_time", "0 min")
        try:
            minutes = int(read_time_str.split()[0])
            read_times.append(minutes)
        except:
            pass
    avg_read_time = f"{int(sum(read_times) / len(read_times)) if read_times else 0} min"
    
    # Calculate engagement rate
    engagement_rate = "0%"
    if total_views > 0:
        engagement = ((total_likes + total_comments) / total_views) * 100
        engagement_rate = f"{engagement:.1f}%"
    
    user_post_ids = [blog["_id"] for blog in all_blogs if blog.get("_id")]

    # Generate views over time (last 7 weeks)
    views_over_time = []
    for i in range(7, 0, -1):
        week_start = datetime.utcnow() - timedelta(weeks=i)
        week_end = week_start + timedelta(weeks=1)
        week_views = sum(
            blog.get("views", 0) for blog in all_blogs
            if blog.get("created_at") and isinstance(blog.get("created_at"), datetime) and week_start <= blog.get("created_at") < week_end
        )
        views_over_time.append({
            "date": f"Week {8-i}",
            "views": week_views
        })
    
    if all(view["views"] == 0 for view in views_over_time) and total_views > 0:
        base_pattern = [0.55, 0.7, 0.9, 1.0, 0.85, 0.65, 0.5]
        total_factor = sum(base_pattern) or 1
        generated = []
        cumulative = 0
        for idx, factor in enumerate(base_pattern):
            value = max(1, int((factor / total_factor) * total_views))
            cumulative += value
            generated.append(value)
        diff = cumulative - total_views
        if diff != 0 and generated:
            adjust_idx = len(generated) // 2
            generated[adjust_idx] = max(1, generated[adjust_idx] - diff)
        views_over_time = [{
            "date": f"Week {idx + 1}",
            "views": generated[idx]
        } for idx in range(len(generated))]
    
    # Generate engagement per day (last 7 days)
    engagement_scores: List[Dict[str, Any]] = []
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)

    likes_collection = db.get_collection("blog_likes") if db is not None else None
    comments_collection = db.get_collection("blog_comments") if db is not None else None
    view_logs_collection = None
    if db is not None:
        try:
            collection_names = db.list_collection_names()
        except Exception:
            collection_names = []
        if "blog_view_logs" in collection_names:
            view_logs_collection = db.get_collection("blog_view_logs")

    for offset in range(6, -1, -1):
        day_start = today_start - timedelta(days=offset)
        day_end = day_start + timedelta(days=1)

        like_count = 0
        comment_count = 0
        view_count = 0

        try:
            if likes_collection is not None and user_post_ids:
                like_count = likes_collection.count_documents({
                    "post_id": {"$in": user_post_ids},
                    "created_at": {"$gte": day_start, "$lt": day_end}
                })
        except Exception:
            like_count = 0

        try:
            if comments_collection is not None and user_post_ids:
                comment_count = comments_collection.count_documents({
                    "post_id": {"$in": user_post_ids},
                    "created_at": {"$gte": day_start, "$lt": day_end}
                })
        except Exception:
            comment_count = 0

        try:
            if view_logs_collection is not None and user_post_ids:
                view_count = view_logs_collection.count_documents({
                    "post_id": {"$in": user_post_ids},
                    "created_at": {"$gte": day_start, "$lt": day_end}
                })
        except Exception:
            view_count = 0

        fallback_engagement = 0
        fallback_views = 0
        for blog in all_blogs:
            created_at = blog.get("created_at")
            if created_at and isinstance(created_at, datetime) and day_start <= created_at < day_end:
                fallback_engagement += blog.get("likes", 0) + blog.get("comments", 0)
                fallback_views += blog.get("views", 0)

        engagement_score = (like_count * 3) + (comment_count * 5) + view_count
        if engagement_score == 0:
            engagement_score = fallback_engagement + max(fallback_views // 5, 0)

        if offset == 0:
            day_label = "Today"
        elif offset == 1:
            day_label = "Yesterday"
        else:
            day_label = day_start.strftime("%b %d")

        engagement_scores.append({
            "label": day_label,
            "score": max(0, int(engagement_score))
        })

    max_score = max((entry["score"] for entry in engagement_scores), default=0)
    if max_score <= 0 and (total_likes + total_comments) > 0:
        synthetic_base = [0.5, 0.65, 0.8, 1.0, 0.85, 0.7, 0.55]
        total_factor = sum(synthetic_base) or 1
        total_engagement = max(1, total_likes + total_comments)
        # Save labels before rebuilding engagement_scores
        saved_labels = [entry["label"] for entry in engagement_scores]
        engagement_scores = []
        cumulative = 0
        for idx, factor in enumerate(synthetic_base):
            value = max(1, int((factor / total_factor) * total_engagement))
            cumulative += value
            engagement_scores.append({
                "label": saved_labels[idx] if idx < len(saved_labels) else f"Day {idx + 1}",
                "score": value
            })
        diff = cumulative - total_engagement
        if diff != 0 and engagement_scores:
            adjust_idx = len(engagement_scores) // 2
            engagement_scores[adjust_idx]["score"] = max(1, engagement_scores[adjust_idx]["score"] - diff)
        max_score = max((entry["score"] for entry in engagement_scores), default=0)
    if max_score <= 0:
        max_score = 1

    engagement_by_week = []
    for entry in engagement_scores:
        percent = int(round((entry["score"] / max_score) * 100)) if max_score else 0
        engagement_by_week.append({
            "week": entry["label"],
            "engagement": max(0, min(100, percent)),
            "raw_engagement": entry["score"]
        })
    
    # Generate top categories with proper colors and dynamic data
    category_counts = {}
    category_views = {}
    category_engagement = {}
    aggregated_categories = []

    if db is not None:
        try:
            pipeline = [
                {"$match": {"status": {"$in": ["published", "Published", "PUBLISHED"]}}},
                {"$group": {
                    "_id": {"$ifNull": ["$category", "General"]},
                    "count": {"$sum": 1},
                    "total_views": {"$sum": {"$ifNull": ["$views", 0]}},
                    "total_engagement": {
                        "$sum": {
                            "$add": [
                                {"$ifNull": ["$likes", 0]},
                                {"$ifNull": ["$comments", 0]}
                            ]
                        }
                    }
                }},
                {"$sort": {"count": -1}}
            ]
            aggregated_categories = list(db.blogs.aggregate(pipeline))
            for doc in aggregated_categories:
                name = doc.get("_id") or "General"
                category_counts[name] = doc.get("count", 0)
                category_views[name] = doc.get("total_views", 0)
                category_engagement[name] = doc.get("total_engagement", 0)
        except Exception:
            aggregated_categories = []

    if not aggregated_categories:
        for blog in all_blogs:
            category = blog.get("category") or "General"
            category_counts[category] = category_counts.get(category, 0) + 1
            category_views[category] = category_views.get(category, 0) + blog.get("views", 0)
            category_engagement[category] = category_engagement.get(category, 0) + blog.get("likes", 0) + blog.get("comments", 0)
    
    total_cat_blogs = sum(category_counts.values())
    category_colors = {
        "nutrition": "#e60a15",
        "fitness": "#ff6b6b",
        "wellness": "#ffa500",
        "general": "#9b59b6",
        "health": "#3498db",
        "lifestyle": "#2ecc71",
        "mindset": "#16a085",
        "workout": "#f39c12",
    }
    default_colors = ["#e60a15", "#ff6b6b", "#ff8e8e", "#ffb3b3", "#ffd9d9"]
    
    top_categories = []
    if total_cat_blogs > 0:
        sorted_categories = sorted(
            category_counts.items(),
            key=lambda x: (x[1], category_engagement.get(x[0], 0)),
            reverse=True
        )
        total_percentage = 0
        for idx, (category, count) in enumerate(sorted_categories[:5]):
            percentage = int(round((count / total_cat_blogs) * 100)) if total_cat_blogs else 0
            if count > 0 and percentage == 0:
                percentage = 1
            color = category_colors.get(category.lower(), default_colors[idx % len(default_colors)])
            top_categories.append({
                "name": category.capitalize() if category else "Other",
                "value": percentage,
                "color": color,
                "count": count,
                "views": category_views.get(category, 0),
                "engagement": category_engagement.get(category, 0)
            })
            total_percentage += percentage
        if total_percentage == 0 and total_cat_blogs > 0:
            for cat in top_categories:
                cat["value"] = int(round((cat.get("count", 0) / total_cat_blogs) * 100))
            total_percentage = sum(cat["value"] for cat in top_categories)
        if total_percentage != 100 and total_percentage > 0 and top_categories:
            diff = total_percentage - 100
            top_categories[0]["value"] = max(1, top_categories[0]["value"] - diff)
    else:
        top_categories = [{
            "name": "No Data",
            "value": 100,
            "color": "#e60a15",
            "count": 0,
            "views": 0,
            "engagement": 0
        }]
    
    return BlogAnalytics(
        total_blogs=total_blogs,
        total_views=total_views,
        total_comments=total_comments,
        total_likes=total_likes,
        avg_read_time=avg_read_time,
        engagement_rate=engagement_rate,
        views_over_time=views_over_time,
        engagement_by_week=engagement_by_week,
        top_categories=top_categories
    )

# -------------------------
# Analytics Endpoints
# -------------------------

@router.get("/analytics", response_model=BlogAnalytics)
async def get_blog_analytics(
    user_id: str = Depends(get_current_user_id)
):
    """Get blog analytics for the user"""
    try:
        return await _calculate_analytics(user_id)
    except Exception as e:
        import traceback
        print(f"Error in get_blog_analytics: {str(e)}")
        print(traceback.format_exc())
        # Return default analytics instead of crashing
        return BlogAnalytics(
            total_blogs=0,
            total_views=0,
            total_comments=0,
            total_likes=0,
            avg_read_time="0 min",
            engagement_rate="0%",
            views_over_time=[{"date": f"Week {i+1}", "views": 0} for i in range(7)],
            engagement_by_week=[{"week": f"Day {i+1}", "engagement": 0, "raw_engagement": 0} for i in range(7)],
            top_categories=[{"name": "No Data", "value": 100, "color": "#e60a15", "count": 0, "views": 0, "engagement": 0}]
        )

# -------------------------
# AI Insights Endpoints
# -------------------------

@router.get("/insights", response_model=AIInsights)
async def get_ai_insights(
    category: Optional[str] = Query(None, description="Category for topic suggestions"),
    user_id: str = Depends(get_current_user_id)
):
    """Get AI insights and suggestions"""
    try:
        # Get user's recent blogs for context
        recent_blogs = list(db.blogs.find({"user_id": user_id}).sort("created_at", DESCENDING).limit(5))
        
        # Get analytics
        analytics_data = await _calculate_analytics(user_id)
        
        # Use engagement agent for insights
        content = ""
        tags = []
        if recent_blogs:
            # Use most recent blog for context
            latest_blog = recent_blogs[0]
            content = latest_blog.get("content", "")[:1000]  # First 1000 chars
            tags = latest_blog.get("tags", [])
        
        engagement_agent = get_engagement_agent()
        engagement_result = await engagement_agent.run({
            "user_id": user_id,
            "tags": tags,
            "content": content
        })
        
        # Get topic suggestions
        suggestion_graph = get_suggestion_graph()
        suggestion_result = await suggestion_graph.run(
            content=content if content else None,
            tags=tags if tags else None,
            user_id=user_id,
            category=category or "general",
            count=5
        )
        
        return AIInsights(
            insights=engagement_result.get("insights", "Your content shows good potential. Focus on trending topics in health and fitness."),
            suggested_tags=engagement_result.get("suggested_tags", []),
            improvements=engagement_result.get("improvements", "Add more engaging visuals, interactive elements, and trending topics."),
            suggested_topics=suggestion_result.get("suggested_topics", []),
            analytics={
                "total_blogs": analytics_data.total_blogs,
                "total_views": analytics_data.total_views,
                "engagement_rate": analytics_data.engagement_rate
            }
        )
    except Exception as e:
        import traceback
        print(f"Error in get_ai_insights: {str(e)}")
        print(traceback.format_exc())
        # Return fallback insights instead of failing
        return AIInsights(
            insights="Your content shows good potential. Focus on trending topics in health and fitness.",
            suggested_tags=[],
            improvements="Add more engaging visuals, interactive elements, and trending topics.",
            suggested_topics=[],
            analytics=None
        )

@router.get("/suggestions/topics", response_model=Dict[str, List[TopicSuggestion]])
async def get_topic_suggestions(
    category: Optional[str] = Query("general", description="Category for suggestions"),
    count: int = Query(5, ge=1, le=10, description="Number of suggestions"),
    user_id: str = Depends(get_current_user_id)
):
    """Get AI-generated topic suggestions"""
    try:
        suggestion_graph = get_suggestion_graph()
        suggestion_result = await suggestion_graph.run(
            content=None,
            tags=None,
            user_id=user_id,
            category=category or "general",
            count=count
        )
        
        return {
            "suggested_topics": suggestion_result.get("suggested_topics", [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating topic suggestions: {str(e)}")

# -------------------------
# Blog Editor Endpoints
# -------------------------

@router.post("/editor/generate-outline", response_model=OutlineResponse)
async def generate_outline(
    request: GenerateOutlineRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate blog outline from topic using BlogGenerationGraph"""
    try:
        graph = get_blog_generation_graph()
        if not graph:
            raise HTTPException(status_code=500, detail="Blog generation graph not available")
        
        # Run planning phase only (no content generation yet)
        result = await graph.run_planning_phase(request.topic, user_id)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate outline"))
        
        # Convert mindmap structure to outline format
        outline = []
        mindmap = result.get("outline", {})
        
        # Debug: Print mindmap structure to understand the format
        print(f"[generate_outline] Mindmap structure: {json.dumps(mindmap, indent=2)[:500]}")
        
        if mindmap.get("sections"):
            for idx, section in enumerate(mindmap["sections"], 1):
                # Handle both "title" and "heading" keys for backward compatibility
                # Also handle if section is a string (direct title)
                if isinstance(section, str):
                    section_title = section
                else:
                    section_title = section.get("title") or section.get("heading") or section.get("name")
                    # If still no title, try to extract from any text field
                    if not section_title:
                        # Try common alternative keys
                        for key in ["text", "content", "label", "name"]:
                            if section.get(key):
                                section_title = section.get(key)
                                break
                    # Last resort: use a descriptive fallback based on index
                    if not section_title:
                        section_titles = ["Introduction", "Main Content", "Key Points", "Advanced Topics", "Best Practices", "Conclusion"]
                        section_title = section_titles[idx - 1] if idx <= len(section_titles) else f"Section {idx}"
                
                outline_item = {
                    "id": str(idx),
                    "title": section_title,
                    "children": []
                }
                # Handle subsections
                if section.get("subsections"):
                    for sub_idx, subsection in enumerate(section["subsections"], 1):
                        if isinstance(subsection, str):
                            sub_title = subsection
                        else:
                            sub_title = subsection.get("title") or subsection.get("heading") or subsection.get("name") or subsection.get("text")
                            if not sub_title:
                                sub_title = f"Subsection {sub_idx}"
                        outline_item["children"].append({
                            "id": f"{idx}{chr(96 + sub_idx)}",
                            "title": sub_title
                        })
                # Handle bullet_points as subsections (backward compatibility)
                elif section.get("bullet_points"):
                    for sub_idx, bullet in enumerate(section["bullet_points"], 1):
                        if isinstance(bullet, str):
                            bullet_text = bullet
                        else:
                            bullet_text = bullet.get("title") or bullet.get("text") or bullet.get("name") or str(bullet)
                        outline_item["children"].append({
                            "id": f"{idx}{chr(96 + sub_idx)}",
                            "title": bullet_text
                        })
                outline.append(outline_item)
        else:
            # If no sections, try to extract from other possible structures
            print(f"[generate_outline] No sections found in mindmap, trying alternative structures...")
            # Try to create outline from any available structure
            if isinstance(mindmap, dict):
                # Check if mindmap itself has a structure we can use
                for key in ["outline", "structure", "content"]:
                    if mindmap.get(key):
                        # Recursively try to extract sections
                        alt_sections = mindmap.get(key)
                        if isinstance(alt_sections, list):
                            for idx, item in enumerate(alt_sections, 1):
                                if isinstance(item, str):
                                    outline.append({
                                        "id": str(idx),
                                        "title": item,
                                        "children": []
                                    })
                                elif isinstance(item, dict):
                                    title = item.get("title") or item.get("heading") or item.get("name") or f"Section {idx}"
                                    outline.append({
                                        "id": str(idx),
                                        "title": title,
                                        "children": []
                                    })
                        break
        
        return OutlineResponse(
            outline=outline,
            mindmap=mindmap,
            title=result.get("title"),
            tags=result.get("tags", []),
            seo_meta=result.get("seo_meta"),
            engagement_suggestions=result.get("engagement_suggestions"),
            success=True
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error generating outline: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating outline: {str(e)}")

@router.post("/editor/generate-content", response_model=ContentResponse)
async def generate_content(
    request: GenerateContentRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate full blog content after user approves the outline"""
    try:
        if not request.approved:
            raise HTTPException(status_code=400, detail="Outline must be approved before generating content")
        
        graph = get_blog_generation_graph()
        if not graph:
            raise HTTPException(status_code=500, detail="Blog generation graph not available")
        
        # Run full generation phase with approved outline
        result = await graph.run_generation_phase(
            topic=request.topic,
            outline=request.outline,
            title=request.title,
            user_id=user_id
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate content"))
        
        return ContentResponse(
            content=result.get("content", ""),
            title=result.get("title"),
            tags=result.get("tags", []),
            seo_meta=result.get("seo_meta"),
            summary=result.get("summary"),
            keywords=result.get("keywords", []),
            engagement_suggestions=result.get("engagement_suggestions"),
            success=True
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error generating content: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating content: {str(e)}")

@router.post("/editor/optimize-title", response_model=OptimizeTitleResponse)
async def optimize_title(
    request: OptimizeTitleRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Optimize blog title for SEO"""
    try:
        # Validate input
        if not request.title or not request.title.strip():
            return OptimizeTitleResponse(
                optimized_title=request.title or "",
                suggestions=[],
                success=False
            )
        
        print(f"[optimize_title] Request received - Title: '{request.title}', Content length: {len(request.content or '')}")
        
        # Call SEO optimizer
        seo_result = await optimize_blog(
            request.title.strip(), 
            "", 
            request.content or ""
        )
        
        # Extract optimized title
        optimized_title = seo_result.get("title", "").strip()
        
        # Validate optimized title
        if not optimized_title:
            print("[optimize_title] Warning: No optimized title returned, using original")
            optimized_title = request.title.strip()
        elif optimized_title == request.title.strip():
            print("[optimize_title] Warning: Optimized title same as original")
        
        # Generate alternative suggestions from tags
        suggestions = [optimized_title]
        if seo_result.get("tags"):
            # Add top tags as alternative title suggestions
            for tag in seo_result["tags"][:4]:
                if tag and tag not in suggestions:
                    suggestions.append(tag)
        
        print(f"[optimize_title] ✅ Success - Optimized: '{optimized_title}', Suggestions: {len(suggestions)}")
        
        return OptimizeTitleResponse(
            optimized_title=optimized_title,
            suggestions=suggestions[:5],
            success=True
        )
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[optimize_title] ❌ Error: {str(e)}")
        print(error_trace)
        return OptimizeTitleResponse(
            optimized_title=request.title or "",
            suggestions=[],
            success=False
        )

@router.post("/editor/improve-readability", response_model=ImproveReadabilityResponse)
async def improve_readability(
    request: ImproveReadabilityRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Improve content readability"""
    try:
        readability_agent = get_readability_agent()
        if not readability_agent:
            raise HTTPException(status_code=500, detail="Readability agent not available")
        
        result = await readability_agent.improve_readability(request.content, request.title or "")
        return ImproveReadabilityResponse(
            improved_content=result.get("improved_content", request.content),
            success=result.get("success", False)
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error improving readability: {str(e)}")
        print(traceback.format_exc())
        return ImproveReadabilityResponse(
            improved_content=request.content,
            success=False
        )

@router.post("/editor/adjust-tone", response_model=AdjustToneResponse)
async def adjust_tone(
    request: AdjustToneRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Adjust content tone"""
    try:
        tone_agent = get_tone_agent()
        if not tone_agent:
            raise HTTPException(status_code=500, detail="Tone agent not available")
        
        result = await tone_agent.adjust_tone(request.content, request.target_tone, request.title or "")
        return AdjustToneResponse(
            adjusted_content=result.get("adjusted_content", request.content),
            success=result.get("success", False)
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error adjusting tone: {str(e)}")
        print(traceback.format_exc())
        return AdjustToneResponse(
            adjusted_content=request.content,
            success=False
        )

@router.post("/editor/generate-meta", response_model=GenerateMetaResponse)
async def generate_meta(
    request: GenerateMetaRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate SEO meta tags"""
    try:
        # Get summary first
        summary_result = await summarize_blog(request.title, request.content)
        summary = summary_result.get("summary", "")
        
        # Get SEO optimization
        seo_result = await optimize_blog(request.title, summary, request.content)
        
        return GenerateMetaResponse(
            seo_meta=seo_result.get("seo_meta", ""),
            tags=seo_result.get("tags", []),
            keywords=summary_result.get("keywords", []),
            success=True
        )
    except Exception as e:
        import traceback
        print(f"Error generating meta: {str(e)}")
        print(traceback.format_exc())
        return GenerateMetaResponse(
            seo_meta="",
            tags=[],
            keywords=[],
            success=False
        )

@router.post("/editor/translate", response_model=TranslateResponse)
async def translate_content(
    request: TranslateRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Translate blog content and title"""
    try:
        # Validate input
        if not request.content or not request.content.strip():
            return TranslateResponse(
                translated_content=request.content or "",
                translated_title=request.title,
                source_language=request.source_language,
                target_language=request.target_language,
                success=False
            )
        
        translation_agent = get_translation_agent()
        if not translation_agent:
            raise HTTPException(status_code=500, detail="Translation agent not available")
        
        print(f"[translate_content] Translating to {request.target_language}...")
        if request.title:
            print(f"[translate_content] Title: '{request.title}'")
        print(f"[translate_content] Content length: {len(request.content)} characters")
        
        result = await translation_agent.translate(
            request.content,
            request.target_language,
            request.source_language,
            request.title
        )
        
        translated_content = result.get("translated_content", request.content)
        translated_title = result.get("translated_title", request.title)
        
        # Validate translation results
        if not translated_content or translated_content.strip() == "":
            translated_content = request.content
            print("[translate_content] Warning: Empty translation, using original content")
        
        if request.title and (not translated_title or translated_title.strip() == ""):
            translated_title = request.title
            print("[translate_content] Warning: Empty title translation, using original title")
        
        print(f"[translate_content] ✅ Translation successful")
        if translated_title:
            print(f"[translate_content] Translated title: '{translated_title}'")
        
        return TranslateResponse(
            translated_content=translated_content,
            translated_title=translated_title,
            source_language=result.get("source_language", request.source_language),
            target_language=result.get("target_language", request.target_language),
            success=result.get("success", False)
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[translate_content] ❌ Error: {str(e)}")
        print(error_trace)
        return TranslateResponse(
            translated_content=request.content or "",
            translated_title=request.title,
            source_language=request.source_language,
            target_language=request.target_language,
            success=False
        )

@router.post("/public/summarize", response_model=SummarizeResponse)
async def summarize_public_blog(
    request: SummarizeRequest
):
    """Summarize blog content (public endpoint, no auth required) - Returns full summary"""
    try:
        # Limit content length to avoid excessive processing (use first 10000 chars for better context)
        # Increased from 5000 to 10000 for more comprehensive summaries
        content = request.content[:10000] if len(request.content) > 10000 else request.content
        
        if not content or len(content.strip()) < 50:
            return SummarizeResponse(
                summary="",
                keywords=[],
                success=False
            )
        
        result = await summarize_blog(request.title, content)
        summary = result.get("summary", "")
        
        # Return the full summary without truncation
        # Only clean up extra whitespace for better formatting
        if summary:
            # Clean up the summary - remove extra whitespace but preserve line breaks and structure
            summary = summary.strip()
            # Replace multiple spaces with single space, but preserve newlines
            summary = re.sub(r' +', ' ', summary)
            # Replace multiple newlines with double newline (paragraph breaks)
            summary = re.sub(r'\n{3,}', '\n\n', summary)
        
        return SummarizeResponse(
            summary=summary,
            keywords=result.get("keywords", [])[:10],  # Increased to 10 keywords for better context
            success=True
        )
    except Exception as e:
        import traceback
        print(f"Error summarizing public blog content: {str(e)}")
        print(traceback.format_exc())
        return SummarizeResponse(
            summary="",
            keywords=[],
            success=False
        )

@router.post("/editor/summarize", response_model=SummarizeResponse)
async def summarize_content(
    request: SummarizeRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Summarize blog content"""
    try:
        result = await summarize_blog(request.title, request.content)
        return SummarizeResponse(
            summary=result.get("summary", ""),
            keywords=result.get("keywords", []),
            success=True
        )
    except Exception as e:
        import traceback
        print(f"Error summarizing content: {str(e)}")
        print(traceback.format_exc())
        return SummarizeResponse(
            summary="",
            keywords=[],
            success=False
        )

@router.post("/editor/suggest-images", response_model=ImageSuggestionResponse)
async def suggest_images(
    request: ImageSuggestionRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Generate image suggestions for blog"""
    try:
        result = generate_image_suggestions(request.content, request.title or "")
        return ImageSuggestionResponse(
            suggestions=result.get("suggestions", []),
            images=result.get("images", []),
            success=result.get("success", False)
        )
    except Exception as e:
        import traceback
        print(f"Error suggesting images: {str(e)}")
        print(traceback.format_exc())
        return ImageSuggestionResponse(
            suggestions=[],
            images=[],
            success=False
        )

@router.post("/editor/regenerate-section", response_model=RegenerateSectionResponse)
async def regenerate_section(
    request: RegenerateSectionRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Regenerate a specific section of blog content"""
    try:
        planner_agent = get_blog_planner_agent()
        if not planner_agent or not planner_agent.model:
            raise HTTPException(status_code=500, detail="Blog planner agent not available")
        
        # Extract the section from full content
        section_patterns = [
            f"## {request.section_title}",
            f"### {request.section_title}",
            f"# {request.section_title}",
            request.section_title
        ]
        
        original_section = ""
        section_start = -1
        
        for pattern in section_patterns:
            section_start = request.full_content.find(pattern)
            if section_start != -1:
                break
        
        if section_start != -1:
            # Get content after the section heading
            section_content = request.full_content[section_start:]
            # Find next heading (## or ###)
            next_heading = section_content.find("\n##", len(section_patterns[0]))
            if next_heading == -1:
                next_heading = section_content.find("\n###", len(section_patterns[0]))
            if next_heading != -1:
                original_section = section_content[:next_heading].strip()
            else:
                original_section = section_content.strip()
        else:
            # If section not found, use first 500 chars as context
            original_section = request.full_content[:500]
        
        prompt = f"""You are an expert content editor. Regenerate and improve the following section of a blog post.

Section Title: {request.section_title}
Improvement Request: {request.improvement_description}

Original Section Content:
{original_section}

Full Blog Context (for reference):
{request.full_content[:1500]}

Instructions:
1. Regenerate the section '{request.section_title}' addressing: {request.improvement_description}
2. Maintain consistency with the rest of the blog's tone and style
3. Keep the same markdown formatting (headings, lists, etc.)
4. Make the section more engaging, clear, and valuable
5. Ensure smooth transitions with surrounding content
6. Return the complete regenerated section including the heading

Return ONLY the regenerated section content, starting with the section heading (## {request.section_title}):"""
        
        response = planner_agent.run_prompt(prompt)
        if response:
            return RegenerateSectionResponse(
                regenerated_section=response.strip(),
                success=True
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to regenerate section")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error regenerating section: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error regenerating section: {str(e)}")

@router.post("/editor/analyze", response_model=ContentAnalysisResponse)
async def analyze_content(
    request: ContentAnalysisRequest,
    user_id: str = Depends(get_current_user_id)
):
    """Analyze content for SEO, readability, and other metrics"""
    try:
        # Calculate read time
        word_count = len(request.content.split())
        read_time = max(1, word_count // 200)
        
        # Get SEO score
        seo_result = await optimize_blog(request.title, "", request.content)
        
        # Calculate keyword density (simplified)
        content_lower = request.content.lower()
        title_words = request.title.lower().split()
        keyword_count = sum(content_lower.count(word) for word in title_words if len(word) > 3)
        keyword_density = (keyword_count / word_count * 100) if word_count > 0 else 0
        
        # Estimate SEO score (0-100)
        seo_score = min(100, max(0, int(50 + (keyword_density * 2) + (len(request.title.split()) * 5))))
        
        # Get summary for suggestions
        summary_result = await summarize_blog(request.title, request.content)
        suggestions = []
        if summary_result.get("keywords"):
            suggestions.append(f"Consider using these keywords: {', '.join(summary_result['keywords'][:5])}")
        
        return ContentAnalysisResponse(
            read_time=read_time,
            seo_score=seo_score,
            keyword_density=round(keyword_density, 2),
            suggestions=suggestions,
            success=True
        )
    except Exception as e:
        import traceback
        print(f"Error analyzing content: {str(e)}")
        print(traceback.format_exc())
        # Return basic analysis
        word_count = len(request.content.split())
        read_time = max(1, word_count // 200)
        return ContentAnalysisResponse(
            read_time=read_time,
            seo_score=50,
            keyword_density=0.0,
            suggestions=[],
            success=False
        )

# -------------------------
# Like/Unlike Endpoints
# -------------------------

@router.post("/posts/{post_id}/like", response_model=LikeResponse)
async def toggle_like(
    post_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Like or unlike a blog post (requires authentication)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        user_id = str(current_user.get("_id"))
        
        # Check if post exists and is published
        post = db.blogs.find_one({"_id": _oid(post_id), "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Check if user already liked this post
        likes_collection = db.get_collection("blog_likes")
        existing_like = likes_collection.find_one({
            "post_id": _oid(post_id),
            "user_id": user_id
        })
        
        if existing_like:
            # Unlike: remove like and decrement count
            likes_collection.delete_one({"_id": existing_like["_id"]})
            db.blogs.update_one({"_id": _oid(post_id)}, {"$inc": {"likes": -1}})
            liked = False
        else:
            # Like: add like and increment count
            likes_collection.insert_one({
                "post_id": _oid(post_id),
                "user_id": user_id,
                "created_at": datetime.utcnow()
            })
            db.blogs.update_one({"_id": _oid(post_id)}, {"$inc": {"likes": 1}})
            liked = True
        
        # Get updated like count
        updated_post = db.blogs.find_one({"_id": _oid(post_id)})
        total_likes = updated_post.get("likes", 0)
        
        return LikeResponse(
            liked=liked,
            total_likes=total_likes,
            success=True
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error toggling like: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error toggling like: {str(e)}")

@router.get("/posts/{post_id}/like-status", response_model=Dict[str, Any])
async def get_like_status(
    post_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if current user has liked a post (requires authentication)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        user_id = str(current_user.get("_id"))
        likes_collection = db.get_collection("blog_likes")
        
        existing_like = likes_collection.find_one({
            "post_id": _oid(post_id),
            "user_id": user_id
        })
        
        return {
            "liked": existing_like is not None,
            "success": True
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"liked": False, "success": False}

# -------------------------
# Comment Endpoints
# -------------------------

@router.post("/posts/{post_id}/comments", response_model=CommentOut)
async def add_comment(
    post_id: str,
    comment: CommentIn,
    current_user: dict = Depends(get_current_user)
):
    """Add a comment to a blog post (requires authentication)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        user_id = str(current_user.get("_id"))
        user_name = current_user.get("full_name", "Anonymous User")
        
        # Get profile picture using helper function
        user_image = _get_user_profile_picture(user_id, current_user)
        
        # Check if post exists and is published
        post = db.blogs.find_one({"_id": _oid(post_id), "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        # Create comment
        comments_collection = db.get_collection("blog_comments")
        comment_data = {
            "post_id": _oid(post_id),
            "user_id": user_id,
            "user_name": user_name,
            "user_image": user_image,
            "content": comment.content,
            "created_at": datetime.utcnow(),
            "updated_at": None
        }
        
        result = comments_collection.insert_one(comment_data)
        comment_data["id"] = str(result.inserted_id)
        comment_data["post_id"] = str(post_id)
        
        # Increment comment count
        db.blogs.update_one({"_id": _oid(post_id)}, {"$inc": {"comments": 1}})
        
        return CommentOut(**comment_data)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error adding comment: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error adding comment: {str(e)}")

@router.get("/posts/{post_id}/comments", response_model=List[CommentOut])
async def get_comments(post_id: str):
    """Get all comments for a blog post (public endpoint)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        # Check if post exists
        post = db.blogs.find_one({"_id": _oid(post_id), "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        comments_collection = db.get_collection("blog_comments")
        comments = list(comments_collection.find({"post_id": _oid(post_id)}).sort("created_at", DESCENDING))
        
        processed_comments = []
        for comment in comments:
            comment = _convert_objectids_to_strings(comment)
            comment["id"] = str(comment.pop("_id"))
            comment["post_id"] = str(post_id)
            
            # If user_image is missing, try to populate it based on auth provider
            if not comment.get("user_image") and comment.get("user_id"):
                try:
                    profile_picture = _get_user_profile_picture(comment["user_id"])
                    if profile_picture:
                        comment["user_image"] = profile_picture
                except Exception as user_error:
                    print(f"Warning: Error enriching comment user image: {user_error}")
            
            processed_comments.append(CommentOut(**comment))
        
        return processed_comments
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error fetching comments: {str(e)}")
        print(traceback.format_exc())
        return []

@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a comment (requires authentication, only own comments or post owner)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        user_id = str(current_user.get("_id"))
        comments_collection = db.get_collection("blog_comments")
        
        # Check if comment exists and belongs to user or user owns the post
        comment = comments_collection.find_one({"_id": _oid(comment_id), "post_id": _oid(post_id)})
        if not comment:
            raise HTTPException(status_code=404, detail="Comment not found")
        
        # Check if user owns comment or post
        post = db.blogs.find_one({"_id": _oid(post_id)})
        is_comment_owner = str(comment.get("user_id")) == user_id
        is_post_owner = post and str(post.get("user_id")) == user_id
        
        if not (is_comment_owner or is_post_owner):
            raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
        
        # Delete comment
        comments_collection.delete_one({"_id": _oid(comment_id)})
        
        # Decrement comment count
        db.blogs.update_one({"_id": _oid(post_id)}, {"$inc": {"comments": -1}})
        
        return {"message": "Comment deleted successfully", "success": True}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error deleting comment: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error deleting comment: {str(e)}")

# -------------------------
# Related Blogs & AI Suggestions
# -------------------------

@router.get("/posts/{post_id}/related", response_model=RelatedBlogsResponse)
async def get_related_blogs(post_id: str):
    """Get related blogs and AI suggestions for a blog post (public endpoint)"""
    try:
        if db is None:
            raise HTTPException(status_code=500, detail="Database connection not available")
        
        # Get the current blog post
        post = db.blogs.find_one({"_id": _oid(post_id), "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Blog post not found")
        
        post = _convert_objectids_to_strings(post)
        category = post.get("category", "general")
        tags = post.get("tags", [])
        content = post.get("content", "")[:2000]  # First 2000 chars for context
        
        # Get related blogs (same category, excluding current post)
        related_query = {
            "status": "published",
            "category": category,
            "_id": {"$ne": _oid(post_id)}
        }
        related_posts = list(db.blogs.find(related_query).sort("views", DESCENDING).limit(5))
        
        processed_related = []
        for related_post in related_posts:
            related_post = _convert_objectids_to_strings(related_post)
            related_post["id"] = str(related_post.pop("_id"))
            if "image_url" in related_post and "imageUrl" not in related_post:
                related_post["imageUrl"] = related_post.get("image_url")
            processed_related.append(related_post)
        
        # Get AI suggestions using SuggestionGraph
        suggested_topics = []
        insights = ""
        try:
            suggestion_graph = get_suggestion_graph()
            if suggestion_graph:
                suggestion_result = await suggestion_graph.run(
                    content=content,
                    tags=tags,
                    user_id=None,  # Public endpoint, no user_id
                    category=category,
                    count=5
                )
                suggested_topics = suggestion_result.get("suggested_topics", [])
                insights = suggestion_result.get("insights", "")
        except Exception as e:
            print(f"Error getting AI suggestions: {str(e)}")
            # Fallback insights
            insights = f"Explore more {category} content to discover related topics and insights."
        
        return RelatedBlogsResponse(
            related_blogs=processed_related,
            suggested_topics=suggested_topics,
            insights=insights,
            success=True
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error getting related blogs: {str(e)}")
        print(traceback.format_exc())
        return RelatedBlogsResponse(
            related_blogs=[],
            suggested_topics=[],
            insights="",
            success=False
        )

