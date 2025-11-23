# ai_blog_agents/graph/suggestion_graph.py
from typing import Dict, Any
import asyncio
from app.ai_blog_agents.agents.engagement_agent import EngagementAgent
from app.ai_blog_agents.agents.topic_suggestion_agent import TopicSuggestionAgent

class BlogSuggestionGraph:
    """
    Generates AI suggestions for blogs:
    - Related topics
    - Tag improvements
    - Engagement improvements
    - Optional: new section ideas or multimedia suggestions
    """

    def __init__(self):
        try:
            self.engagement_agent = EngagementAgent()
        except Exception as e:
            print(f"[BlogSuggestionGraph] Warning: Failed to initialize EngagementAgent: {e}")
            self.engagement_agent = None
        
        try:
            self.topic_suggestion_agent = TopicSuggestionAgent()
        except Exception as e:
            print(f"[BlogSuggestionGraph] Warning: Failed to initialize TopicSuggestionAgent: {e}")
            self.topic_suggestion_agent = None

    async def run(self, content: str = None, tags: list = None, user_id: str = None, category: str = None, count: int = 5) -> Dict[str, Any]:
        """
        Input:
        {
            "content": "Blog content" (optional),
            "tags": ["tag1", "tag2"] (optional),
            "user_id": "user_123" (optional),
            "category": "nutrition" (optional)
        }

        Output:
        {
            "suggested_topics": [{"title": "...", "reason": "...", "trending": bool, "category": "..."}],
            "suggested_tags": ["tag1", "tag2"],
            "improvements": "Text suggestions to improve engagement",
            "insights": "Performance insights",
            "new_section_ideas": ["Idea1", "Idea2"]
        }
        """
        results = {}

        # If we have content, use engagement agent
        if content and self.engagement_agent:
            try:
                engagement_result = await self.engagement_agent.run({
                    "user_id": user_id,
                    "tags": tags or [],
                    "content": content
                })
                results.update({
                    "suggested_tags": engagement_result.get("suggested_tags", []),
                    "improvements": engagement_result.get("improvements", ""),
                    "insights": engagement_result.get("insights", ""),
                    "analytics": engagement_result.get("analytics")
                })
            except Exception as e:
                print(f"[BlogSuggestionGraph] Error running engagement agent: {e}")
                results.update({
                    "suggested_tags": [],
                    "improvements": "",
                    "insights": "AI features temporarily unavailable.",
                    "analytics": None
                })
        elif content:
            # Agent not initialized, provide defaults
            results.update({
                "suggested_tags": tags[:5] if tags else [],
                "improvements": "AI features unavailable. Please check configuration.",
                "insights": "AI features temporarily unavailable.",
                "analytics": None
            })

        # Always generate topic suggestions
        if self.topic_suggestion_agent:
            try:
                topic_result = await self.topic_suggestion_agent.run({
                    "user_id": user_id,
                    "category": category or "general",
                    "existing_topics": [],
                    "count": count
                })
                results["suggested_topics"] = topic_result.get("suggested_topics", [])
            except Exception as e:
                print(f"[BlogSuggestionGraph] Error running topic suggestion agent: {e}")
                results["suggested_topics"] = []
        else:
            # Agent not initialized, provide fallback topics
            results["suggested_topics"] = self._get_fallback_topics(category or "general", count)

        # Generate new section ideas if content provided
        if content:
            new_sections = await self._generate_section_ideas(content, tags or [])
            results["new_section_ideas"] = new_sections
        else:
            results["new_section_ideas"] = []

        return results

    async def _generate_section_ideas(self, content: str, tags: list) -> list:
        """Generate new section ideas using the engagement agent's AI"""
        if not self.engagement_agent:
            return []
        
        try:
            prompt = f"""
You are a health & fitness content strategist.

Based on the blog content: "{content[:2000]}"
and tags: {tags}
Generate 3-5 new section ideas or multimedia suggestions that could make the blog more engaging.
Return as a JSON list: ["Idea1", "Idea2", ...]
"""
            response = self.engagement_agent.run_prompt(prompt)
            
            if not response:
                return []
            
            import json
            import re
            try:
                start = response.find("[")
                end = response.rfind("]")
                if start != -1 and end != -1:
                    return json.loads(response[start:end+1])
            except Exception:
                pass
        except Exception as e:
            print(f"[BlogSuggestionGraph] Error generating section ideas: {e}")
        
        return []
    
    def _get_fallback_topics(self, category: str, count: int) -> list:
        """Get fallback topic suggestions when AI is unavailable"""
        fallback_topics = {
            "nutrition": [
                {"title": "Intermittent Fasting: Is It Right for You?", "reason": "High search volume and trending topic.", "trending": True, "category": "nutrition"},
                {"title": "The Benefits of Probiotics for Gut Health", "reason": "Aligns with your best-performing category.", "trending": True, "category": "nutrition"},
                {"title": "Plant-Based Protein: Complete Guide", "reason": "Evergreen content with strong engagement.", "trending": False, "category": "nutrition"},
            ],
            "fitness": [
                {"title": "Home Workouts: No Equipment Needed", "reason": "High search volume and trending topic.", "trending": True, "category": "fitness"},
                {"title": "HIIT vs. Cardio: What's Best for Weight Loss?", "reason": "Aligns with your best-performing category.", "trending": True, "category": "fitness"},
                {"title": "Building Muscle: A Complete Guide", "reason": "Evergreen content with strong engagement.", "trending": False, "category": "fitness"},
            ],
            "wellness": [
                {"title": "How Sleep Affects Your Mental Wellness", "reason": "High search volume and trending topic.", "trending": True, "category": "wellness"},
                {"title": "Mindfulness and Meditation for Stress Relief", "reason": "Aligns with your best-performing category.", "trending": True, "category": "wellness"},
                {"title": "The Science of Sleep and Cognitive Performance", "reason": "Evergreen content with strong engagement.", "trending": False, "category": "wellness"},
            ]
        }
        topics = fallback_topics.get(category, fallback_topics["nutrition"])
        return topics[:count]


# ------------------------------
# Async runner for testing
# ------------------------------
if __name__ == "__main__":
    async def main():
        graph = BlogSuggestionGraph()
        result = await graph.run(
            content="Intermittent fasting can improve health, weight loss, and energy levels...",
            tags=["intermittent_fasting", "health"],
            user_id="user_123",
            category="nutrition"
        )
        import json
        print(json.dumps(result, indent=2))

    asyncio.run(main())
