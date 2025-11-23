# ai_blog_agents/graph/blog_summarizer_graph.py
from typing import Dict, Any
import asyncio
from app.ai_blog_agents.agents.summarizer_agent import summarize_blog

# Note: This graph is not currently used in the blog router
# Updated to use the function-based summarizer_agent

class BlogSummarizerGraph:
    """
    Generates blog summaries and keywords for feed display, SEO, or AI suggestions.
    """

    def __init__(self, llm_client=None):
        # LLMClient doesn't exist, using function-based approach
        self.llm_client = llm_client

    async def run(self, title: str, content: str) -> Dict[str, Any]:
        """
        Input:
        {
            "title": "Blog Title",
            "content": "Full blog content"
        }

        Output:
        {
            "summary": "Short 1-2 sentence summary",
            "keywords": ["keyword1", "keyword2", ...]
        }
        """
        try:
            result = await summarize_blog(title, content)
            return result
        except Exception as e:
            print(f"[BlogSummarizerGraph] Error: {e}")
            return {
                "summary": "",
                "keywords": []
            }


# ------------------------------
# Async runner for testing
# ------------------------------
if __name__ == "__main__":
    async def main():
        graph = BlogSummarizerGraph()
        result = await graph.run(
            title="Intermittent Fasting Benefits",
            content=("Intermittent fasting is a popular approach to improve health, "
                     "boost metabolism, and aid weight loss. This article explores "
                     "how it affects the body, benefits, and tips for beginners...")
        )
        import json
        print(json.dumps(result, indent=2))

    asyncio.run(main())
