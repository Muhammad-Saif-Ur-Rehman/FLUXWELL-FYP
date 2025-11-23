# ai_blog_agents/graph/blog_generation_graph.py
from typing import Dict, Any, Optional
import asyncio
from app.ai_blog_agents.agents.blog_planner_agent import BlogPlannerAgent
from app.ai_blog_agents.agents.engagement_agent import EngagementAgent
from app.ai_blog_agents.agents.blog_writer_agent import generate_blog
from app.ai_blog_agents.agents.seo_optimizer_agent import optimize_blog
from app.ai_blog_agents.agents.summarizer_agent import summarize_blog

class BlogGenerationGraph:
    """
    Orchestrates the complete blog generation workflow:
    1. Planning: Generate outline and structure
    2. Writing: Generate full blog content (optional, on approval)
    3. SEO Optimization: Optimize title, meta tags, and tags
    4. Summarization: Generate summary and keywords
    5. Engagement: Get engagement suggestions
    """
    
    def __init__(self):
        try:
            self.planner_agent = BlogPlannerAgent()
        except Exception as e:
            print(f"[BlogGenerationGraph] Warning: Failed to initialize BlogPlannerAgent: {e}")
            self.planner_agent = None
        
        try:
            self.engagement_agent = EngagementAgent()
        except Exception as e:
            print(f"[BlogGenerationGraph] Warning: Failed to initialize EngagementAgent: {e}")
            self.engagement_agent = None

    async def run_planning_phase(self, topic: str, user_id: str = None) -> Dict[str, Any]:
        """
        Phase 1: Planning - Generate outline, title, tags, and engagement suggestions.
        This is called when user inputs an idea/topic.
        Does NOT generate full content yet - waits for user approval.
        """
        if not self.planner_agent:
            return {
                "topic": topic,
                "outline": {},
                "title": topic,
                "tags": [],
                "seo_meta": "",
                "engagement_suggestions": {},
                "success": False,
                "error": "Blog planner agent not available"
            }
        
        try:
            # 1️⃣ Planner: Generate outline and structure
            plan_result = await self.planner_agent.plan_blog(topic)
            if not plan_result:
                raise Exception("Planner agent returned None")
            
            mindmap = plan_result.get("mindmap", {})
            outline = mindmap
            suggested_title = mindmap.get("title", topic)
            suggested_tags = mindmap.get("tags", [])
            
            # If no tags from mindmap, try to extract from sections
            if not suggested_tags and mindmap.get("sections"):
                # Extract keywords from section titles
                for section in mindmap.get("sections", []):
                    section_title = section.get("title", "")
                    if section_title:
                        # Simple keyword extraction (can be improved)
                        words = section_title.lower().split()
                        suggested_tags.extend([w for w in words if len(w) > 4][:2])
                suggested_tags = list(set(suggested_tags))[:5]  # Limit to 5 unique tags

            # 2️⃣ SEO Optimization: Get optimized title and meta
            seo_result = {}
            try:
                seo_result = await optimize_blog(suggested_title, "", "")
                if seo_result.get("title"):
                    suggested_title = seo_result.get("title", suggested_title)
                if seo_result.get("tags"):
                    suggested_tags = list(set(suggested_tags + seo_result.get("tags", [])))[:10]
            except Exception as e:
                print(f"[BlogGenerationGraph] SEO optimization error: {e}")

            # 3️⃣ Engagement: Get engagement suggestions based on topic and tags
            engagement_result = {}
            if self.engagement_agent:
                try:
                    engagement_result = await self.engagement_agent.run({
                        "user_id": user_id,
                        "tags": suggested_tags,
                        "content": ""  # No content yet in planning phase
                    })
                except Exception as e:
                    print(f"[BlogGenerationGraph] Engagement agent error: {e}")

            return {
                "topic": topic,
                "outline": outline,
                "title": suggested_title,
                "tags": suggested_tags,
                "seo_meta": seo_result.get("seo_meta", ""),
                "engagement_suggestions": engagement_result,
                "success": True
            }
        except Exception as e:
            import traceback
            print(f"[BlogGenerationGraph] Error in planning phase: {e}")
            print(traceback.format_exc())
            return {
                "topic": topic,
                "outline": {},
                "title": topic,
                "tags": [],
                "seo_meta": "",
                "engagement_suggestions": {},
                "success": False,
                "error": str(e)
            }

    async def run_generation_phase(self, topic: str, outline: Dict[str, Any] = None, title: str = None, user_id: str = None) -> Dict[str, Any]:
        """
        Phase 2: Full Generation - Generate complete blog content.
        This is called after user approves the outline.
        """
        try:
            # 1️⃣ Writer: Generate full blog content
            blog_result = await generate_blog(topic)
            content = blog_result.get("content", "")
            generated_mindmap = blog_result.get("mindmap", outline or {})
            
            # Use provided title or generated title
            final_title = title or generated_mindmap.get("title", topic)
            
            # 2️⃣ Summarization: Generate summary and keywords
            summary_result = {}
            if content:
                try:
                    summary_result = await summarize_blog(final_title, content)
                except Exception as e:
                    print(f"[BlogGenerationGraph] Summarization error: {e}")

            # 3️⃣ SEO Optimization: Optimize with full content
            seo_result = {}
            if content:
                try:
                    summary_text = summary_result.get("summary", "")
                    seo_result = await optimize_blog(final_title, summary_text, content)
                except Exception as e:
                    print(f"[BlogGenerationGraph] SEO optimization error: {e}")

            # 4️⃣ Engagement: Get engagement suggestions with full content
            engagement_result = {}
            if self.engagement_agent and content:
                try:
                    tags = generated_mindmap.get("tags", [])
                    if seo_result.get("tags"):
                        tags = list(set(tags + seo_result.get("tags", [])))
                    engagement_result = await self.engagement_agent.run({
                        "user_id": user_id,
                        "tags": tags,
                        "content": content[:1000]  # First 1000 chars for context
                    })
                except Exception as e:
                    print(f"[BlogGenerationGraph] Engagement agent error: {e}")

            return {
                "topic": topic,
                "outline": generated_mindmap,
                "content": content,
                "title": final_title,
                "seo_meta": seo_result.get("seo_meta", ""),
                "tags": seo_result.get("tags", generated_mindmap.get("tags", [])),
                "summary": summary_result.get("summary", ""),
                "keywords": summary_result.get("keywords", []),
                "engagement_suggestions": engagement_result,
                "success": True
            }
        except Exception as e:
            import traceback
            print(f"[BlogGenerationGraph] Error in generation phase: {e}")
            print(traceback.format_exc())
            return {
                "topic": topic,
                "outline": outline or {},
                "content": "",
                "title": title or topic,
                "seo_meta": "",
                "tags": [],
                "summary": "",
                "keywords": [],
                "engagement_suggestions": {},
                "success": False,
                "error": str(e)
            }

    async def run(self, topic: str, user_id: str = None, generate_content: bool = False, outline: Dict[str, Any] = None, title: str = None) -> Dict[str, Any]:
        """
        Main entry point. Can run planning phase only or full generation.
        
        Args:
            topic: Blog topic/idea
            user_id: User ID for engagement analysis
            generate_content: If True, generates full content. If False, only planning phase.
            outline: Optional outline to use for content generation (from planning phase)
            title: Optional title to use for content generation (from planning phase)
        """
        if generate_content:
            # Full generation phase
            return await self.run_generation_phase(topic, outline, title, user_id)
        else:
            # Planning phase only
            return await self.run_planning_phase(topic, user_id)

# Test runner
if __name__ == "__main__":
    async def main():
        graph = BlogGenerationGraph()
        result = await graph.run("Intermittent Fasting Benefits")
        import json
        print(json.dumps(result, indent=2))
    asyncio.run(main())
