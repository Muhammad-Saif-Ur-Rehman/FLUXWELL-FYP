# ai_blog_agents/tools/serpapi_tool.py
from typing import List, Dict

async def search_web(query: str, num_results: int = 5) -> List[Dict]:
    """
    Simulate web search results.
    """
    return [
        {"title": f"Web result {i+1} for {query}", "url": f"https://example.com/{i+1}"}
        for i in range(num_results)
    ]
