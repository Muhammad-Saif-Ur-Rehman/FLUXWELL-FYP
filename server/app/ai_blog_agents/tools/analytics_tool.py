# ai_blog_agents/tools/analytics_tool.py
from typing import Dict

def get_blog_analytics(blog_id: str) -> Dict:
    """
    Returns dummy analytics metrics
    """
    return {
        "views": 150,
        "likes": 45,
        "comments": 12,
        "shares": 5,
        "average_read_time": 4.5  # in minutes
    }
