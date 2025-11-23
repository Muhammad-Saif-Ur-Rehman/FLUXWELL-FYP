from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId

# Blog Post Models
class BlogPostIn(BaseModel):
    title: str
    content: str
    excerpt: Optional[str] = None
    category: Optional[str] = "general"
    tags: List[str] = []
    image_url: Optional[str] = None
    status: str = "draft"  # "draft" or "published"
    seo_meta: Optional[str] = None

class BlogPostOut(BlogPostIn):
    id: str
    user_id: str
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    read_time: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None

# Analytics Models
class BlogAnalytics(BaseModel):
    total_blogs: int
    total_views: int
    total_comments: int
    total_likes: int
    avg_read_time: str
    engagement_rate: str
    views_over_time: List[Dict[str, Any]] = []
    engagement_by_week: List[Dict[str, Any]] = []
    top_categories: List[Dict[str, Any]] = []

# AI Insights Models
class TopicSuggestion(BaseModel):
    title: str
    reason: str
    trending: bool
    category: str

class AIInsights(BaseModel):
    insights: str
    suggested_tags: List[str] = []
    improvements: str
    suggested_topics: List[TopicSuggestion] = []
    analytics: Optional[Dict[str, Any]] = None

# Chart Data Models
class ViewsOverTimeData(BaseModel):
    date: str
    views: int

class EngagementByWeekData(BaseModel):
    week: str
    engagement: int
    raw_engagement: Optional[int] = None

class CategoryData(BaseModel):
    name: str
    value: int
    color: str

# Blog Editor Models
class GenerateOutlineRequest(BaseModel):
    topic: str

class OutlineResponse(BaseModel):
    outline: List[Dict[str, Any]]
    mindmap: Optional[Dict[str, Any]] = None
    title: Optional[str] = None
    tags: List[str] = []
    seo_meta: Optional[str] = None
    engagement_suggestions: Optional[Dict[str, Any]] = None
    success: bool = True

class GenerateContentRequest(BaseModel):
    topic: str
    outline: Optional[Dict[str, Any]] = None
    title: Optional[str] = None
    approved: bool = True  # User has approved the outline

class ContentResponse(BaseModel):
    content: str
    title: Optional[str] = None
    tags: List[str] = []
    seo_meta: Optional[str] = None
    summary: Optional[str] = None
    keywords: List[str] = []
    engagement_suggestions: Optional[Dict[str, Any]] = None
    success: bool = True

class OptimizeTitleRequest(BaseModel):
    title: str
    content: Optional[str] = None

class OptimizeTitleResponse(BaseModel):
    optimized_title: str
    suggestions: List[str] = []
    success: bool = True

class ImproveReadabilityRequest(BaseModel):
    content: str
    title: Optional[str] = None

class ImproveReadabilityResponse(BaseModel):
    improved_content: str
    success: bool = True

class AdjustToneRequest(BaseModel):
    content: str
    target_tone: str = "professional"
    title: Optional[str] = None

class AdjustToneResponse(BaseModel):
    adjusted_content: str
    success: bool = True

class GenerateMetaRequest(BaseModel):
    title: str
    content: str

class GenerateMetaResponse(BaseModel):
    seo_meta: str
    tags: List[str] = []
    keywords: List[str] = []
    success: bool = True

class TranslateRequest(BaseModel):
    content: str
    title: Optional[str] = None
    target_language: str = "es"
    source_language: str = "en"

class TranslateResponse(BaseModel):
    translated_content: str
    translated_title: Optional[str] = None
    source_language: str
    target_language: str
    success: bool = True

class SummarizeRequest(BaseModel):
    title: str
    content: str

class SummarizeResponse(BaseModel):
    summary: str
    keywords: List[str] = []
    success: bool = True

class ImageSuggestionRequest(BaseModel):
    content: str
    title: Optional[str] = None

class ImageSuggestionResponse(BaseModel):
    suggestions: List[Dict[str, Any]] = []
    images: List[Dict[str, Any]] = []
    success: bool = True

class RegenerateSectionRequest(BaseModel):
    section_title: str
    improvement_description: str
    full_content: str

class RegenerateSectionResponse(BaseModel):
    regenerated_section: str
    success: bool = True

class ContentAnalysisRequest(BaseModel):
    title: str
    content: str

class ContentAnalysisResponse(BaseModel):
    read_time: int
    seo_score: int
    keyword_density: float
    readability_score: Optional[float] = None
    suggestions: List[str] = []
    success: bool = True

# Comment Models
class CommentIn(BaseModel):
    content: str

class CommentOut(BaseModel):
    id: str
    post_id: str
    user_id: str
    user_name: str
    user_image: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class LikeRequest(BaseModel):
    post_id: str

class LikeResponse(BaseModel):
    liked: bool
    total_likes: int
    success: bool = True

class RelatedBlogsResponse(BaseModel):
    related_blogs: List[Dict[str, Any]] = []
    suggested_topics: List[TopicSuggestion] = []
    insights: str = ""
    success: bool = True

