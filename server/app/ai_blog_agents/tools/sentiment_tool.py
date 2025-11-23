# ai_blog_agents/tools/sentiment_tool.py
from typing import List, Dict, Any
import os
from langchain_groq import ChatGroq
from app.ai_blog_agents.utils.helpers import safe_json_parse

# Initialize ChatGroq for sentiment analysis
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        groq_model = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
    else:
        groq_model = None
        print("[SentimentTool] Warning: GROQ_API_KEY not set")
except Exception as e:
    groq_model = None
    print(f"[SentimentTool] Warning: Failed to initialize ChatGroq: {e}")

def analyze_sentiment(comments: List[str]) -> Dict[str, Any]:
    """
    Analyzes sentiment of comments using AI.
    Returns sentiment breakdown and recommendations.
    """
    if not comments or len(comments) == 0:
        return {
            "positive": 0,
            "negative": 0,
            "neutral": 0,
            "overall_sentiment": "neutral",
            "recommendations": []
        }
    
    # Simple keyword-based fallback
    positive_keywords = ["good", "great", "excellent", "love", "amazing", "helpful", "thanks", "thank you", "awesome", "fantastic"]
    negative_keywords = ["bad", "hate", "terrible", "awful", "worst", "disappointed", "poor", "useless"]
    
    positive_count = sum(1 for c in comments if any(kw in c.lower() for kw in positive_keywords))
    negative_count = sum(1 for c in comments if any(kw in c.lower() for kw in negative_keywords))
    neutral_count = len(comments) - positive_count - negative_count
    
    # Use AI for better analysis if available
    if groq_model and len(comments) > 0:
        try:
            comments_text = "\n".join([f"{i+1}. {c}" for i, c in enumerate(comments[:20])])  # Limit to 20 comments
            prompt = f"""Analyze the sentiment of the following blog comments and provide insights:

Comments:
{comments_text}

Provide a JSON response with:
{{
    "positive": <count of positive comments>,
    "negative": <count of negative comments>,
    "neutral": <count of neutral comments>,
    "overall_sentiment": "positive" | "negative" | "neutral",
    "key_themes": ["theme1", "theme2"],
    "recommendations": ["recommendation1", "recommendation2"]
}}

Return ONLY valid JSON:"""
            
            response = groq_model.invoke(prompt)
            if response and response.content:
                result = safe_json_parse(response.content, {})
                if result:
                    return {
                        "positive": result.get("positive", positive_count),
                        "negative": result.get("negative", negative_count),
                        "neutral": result.get("neutral", neutral_count),
                        "overall_sentiment": result.get("overall_sentiment", "neutral"),
                        "key_themes": result.get("key_themes", []),
                        "recommendations": result.get("recommendations", [])
                    }
        except Exception as e:
            print(f"[SentimentTool] Error in AI analysis: {e}")
    
    # Fallback to keyword-based analysis
    overall = "positive" if positive_count > negative_count else ("negative" if negative_count > positive_count else "neutral")
    
    return {
        "positive": positive_count,
        "negative": negative_count,
        "neutral": neutral_count,
        "overall_sentiment": overall,
        "key_themes": [],
        "recommendations": []
    }
