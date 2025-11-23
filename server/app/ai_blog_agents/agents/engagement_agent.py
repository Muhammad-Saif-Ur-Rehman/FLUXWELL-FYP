# ai_blog_agents/agents/engagement_agent.py
from typing import Dict, Any, Optional
from app.ai_blog_agents.agents.base_agent import BaseAgent
from app.ai_blog_agents.tools.sentiment_tool import analyze_sentiment
from app.ai_blog_agents.tools.analytics_tool import get_blog_analytics
from app.ai_blog_agents.tools.pinecone_tool import query_similar
import json
import re

class EngagementAgent(BaseAgent):
    """
    Analyzes blog engagement and provides insights and suggestions.
    """
    
    def __init__(self, model_name: str = "openai/gpt-oss-20b"):
        super().__init__(model_name)
    
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyzes engagement and provides insights.
        
        Input:
        {
            "user_id": str (optional),
            "tags": List[str] (optional),
            "content": str (optional),
            "blog_id": str (optional)
        }
        
        Output:
        {
            "insights": str,
            "suggested_tags": List[str],
            "improvements": str,
            "analytics": Dict (if blog_id provided)
        }
        """
        user_id = input_data.get("user_id")
        tags = input_data.get("tags", [])
        content = input_data.get("content", "")
        blog_id = input_data.get("blog_id")
        
        results = {
            "insights": "",
            "suggested_tags": [],
            "improvements": "",
            "analytics": None
        }
        
        # Get analytics if blog_id provided
        if blog_id:
            results["analytics"] = get_blog_analytics(blog_id)
        
        # Generate insights using AI
        insights_prompt = f"""You are an expert content strategist for health and fitness blogs.

Analyze the following blog content and provide engagement insights:
Content: {content[:1000] if content else "No content provided"}
Tags: {', '.join(tags) if tags else "No tags"}

Provide:
1. Key insights about what makes this content engaging
2. Suggested tags to improve discoverability (return as JSON array)
3. Specific improvements to increase engagement

Format your response as JSON:
{{
    "insights": "Your insights here",
    "suggested_tags": ["tag1", "tag2", "tag3"],
    "improvements": "Your improvement suggestions here"
}}
"""
        
        try:
            response = self.run_prompt(insights_prompt)
            if response:
                # Try to parse JSON from response
                json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    results["insights"] = parsed.get("insights", "")
                    results["suggested_tags"] = parsed.get("suggested_tags", [])
                    results["improvements"] = parsed.get("improvements", "")
                else:
                    # Fallback: use response as insights
                    results["insights"] = response[:500]
                    results["suggested_tags"] = tags[:5] if tags else []
                    results["improvements"] = "Consider adding more engaging visuals and interactive elements."
        except Exception as e:
            print(f"[EngagementAgent] Error: {e}")
            # Fallback values
            results["insights"] = "Your content shows good potential. Focus on trending topics in health and fitness."
            results["suggested_tags"] = tags[:5] if tags else []
            results["improvements"] = "Add more engaging visuals, interactive elements, and trending topics."
        
        return results

async def learn_from_feedback(blog_id: str, comments: list):
    """
    Learns from blog analytics and comments to improve topic suggestions.
    """
    analytics = get_blog_analytics(blog_id)
    sentiment = analyze_sentiment(comments)
    similar_topics = await query_similar(["fitness", "health"])  # example tags
    
    feedback_summary = {
        "analytics": analytics,
        "sentiment": sentiment,
        "related_topics": similar_topics
    }
    return feedback_summary
