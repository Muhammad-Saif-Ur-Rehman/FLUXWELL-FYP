# ai_blog_agents/agents/topic_suggestion_agent.py
from typing import Dict, Any, List
from app.ai_blog_agents.agents.base_agent import BaseAgent
from app.ai_blog_agents.tools.serpapi_tool import search_web
import json
import re

class TopicSuggestionAgent(BaseAgent):
    """
    Generates trending and relevant topic suggestions for blog posts.
    """
    
    def __init__(self, model_name: str = "openai/gpt-oss-20b"):
        super().__init__(model_name)
    
    async def run(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generates topic suggestions based on user preferences and trending topics.
        
        Input:
        {
            "user_id": str (optional),
            "category": str (optional, e.g., "nutrition", "fitness", "wellness"),
            "existing_topics": List[str] (optional),
            "count": int (default: 5)
        }
        
        Output:
        {
            "suggested_topics": [
                {
                    "title": str,
                    "reason": str,
                    "trending": bool,
                    "category": str
                }
            ]
        }
        """
        user_id = input_data.get("user_id")
        category = input_data.get("category", "general")
        existing_topics = input_data.get("existing_topics", [])
        count = input_data.get("count", 5)
        
        # Search for trending topics
        search_query = f"trending {category} health fitness topics 2024"
        web_results = await search_web(search_query, num_results=3)
        
        # Generate topic suggestions using AI
        prompt = f"""You are an expert content strategist for health and fitness blogs.

Generate {count} engaging blog topic suggestions for the "{category}" category.

Consider:
- Current trends in health and fitness
- High search volume topics
- Evergreen content that performs well
- Topics that align with user interests

Avoid these existing topics: {', '.join(existing_topics) if existing_topics else "None"}

For each topic, provide:
- A compelling title
- A reason why it's a good topic (trending, high engagement, etc.)
- Whether it's currently trending (true/false)
- The category it belongs to

Format your response as JSON:
{{
    "suggested_topics": [
        {{
            "title": "Topic Title Here",
            "reason": "Why this topic is good (e.g., High search volume and trending topic)",
            "trending": true,
            "category": "{category}"
        }}
    ]
}}
"""
        
        try:
            response = self.run_prompt(prompt)
            if response:
                # Try to parse JSON from response
                json_match = re.search(r'\{[^{}]*"suggested_topics"[^{}]*\[[^\]]*\][^{}]*\}', response, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    topics = parsed.get("suggested_topics", [])
                    # Ensure we have the right count
                    return {"suggested_topics": topics[:count]}
                else:
                    # Fallback: generate default topics
                    return self._generate_fallback_topics(category, count)
        except Exception as e:
            print(f"[TopicSuggestionAgent] Error: {e}")
            return self._generate_fallback_topics(category, count)
        
        return self._generate_fallback_topics(category, count)
    
    def _generate_fallback_topics(self, category: str, count: int) -> Dict[str, List[Dict[str, Any]]]:
        """Generate fallback topics if AI fails"""
        fallback_topics = {
            "nutrition": [
                {
                    "title": "Intermittent Fasting: Is It Right for You?",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "nutrition"
                },
                {
                    "title": "The Benefits of Probiotics for Gut Health",
                    "reason": "Aligns with your best-performing category.",
                    "trending": True,
                    "category": "nutrition"
                },
                {
                    "title": "Plant-Based Protein: Complete Guide",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "nutrition"
                },
                {
                    "title": "Meal Prep Hacks for Busy Professionals",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "nutrition"
                },
                {
                    "title": "Understanding Macronutrients: A Beginner's Guide",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "nutrition"
                }
            ],
            "fitness": [
                {
                    "title": "Home Workouts: No Equipment Needed",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "fitness"
                },
                {
                    "title": "HIIT vs. Cardio: What's Best for Weight Loss?",
                    "reason": "Aligns with your best-performing category.",
                    "trending": True,
                    "category": "fitness"
                },
                {
                    "title": "Building Muscle: A Complete Guide",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "fitness"
                },
                {
                    "title": "Recovery Techniques for Athletes",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "fitness"
                },
                {
                    "title": "Yoga for Beginners: Getting Started",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "fitness"
                }
            ],
            "wellness": [
                {
                    "title": "How Sleep Affects Your Mental Wellness",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "wellness"
                },
                {
                    "title": "Mindfulness and Meditation for Stress Relief",
                    "reason": "Aligns with your best-performing category.",
                    "trending": True,
                    "category": "wellness"
                },
                {
                    "title": "The Science of Sleep and Cognitive Performance",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "wellness"
                },
                {
                    "title": "Managing Anxiety Through Exercise",
                    "reason": "High search volume and trending topic.",
                    "trending": True,
                    "category": "wellness"
                },
                {
                    "title": "Building Healthy Habits That Stick",
                    "reason": "Evergreen content with strong engagement.",
                    "trending": False,
                    "category": "wellness"
                }
            ]
        }
        
        topics = fallback_topics.get(category, fallback_topics["nutrition"])
        return {"suggested_topics": topics[:count]}

