# ai_blog_agents/agents/seo_optimizer_agent.py
from pathlib import Path
import os
from langchain_groq import ChatGroq
from app.ai_blog_agents.utils.helpers import safe_json_parse

PROMPT_PATH = Path(__file__).parent.parent / "utils" / "prompts" / "seo_prompt.txt"
with open(PROMPT_PATH, "r") as f:
    SEO_PROMPT_TEMPLATE = f.read()

# Initialize ChatGroq with API key
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        groq = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
    else:
        groq = None
        print("[SEOOptimizerAgent] Warning: GROQ_API_KEY not set")
except Exception as e:
    groq = None
    print(f"[SEOOptimizerAgent] Warning: Failed to initialize ChatGroq: {e}")

def _simple_title_optimization(title: str) -> str:
    """
    Simple fallback title optimization when AI is not available.
    Basic improvements: capitalize properly, ensure it's not too long.
    """
    if not title:
        return title
    
    # Basic improvements
    words = title.split()
    optimized = " ".join(word.capitalize() if word.lower() not in ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'] else word.lower() for word in words)
    
    # Capitalize first word
    if optimized:
        optimized = optimized[0].upper() + optimized[1:] if len(optimized) > 1 else optimized.upper()
    
    # Ensure reasonable length (truncate if too long)
    if len(optimized) > 70:
        optimized = optimized[:67] + "..."
    
    return optimized

async def optimize_blog(title: str, summary: str, content: str):
    """
    Optimizes SEO metadata and tags for a blog.
    Returns: {"title": str, "seo_meta": str, "tags": List[str]}
    """
    if not groq:
        print("[SEOOptimizerAgent] Groq not available, using simple optimization")
        optimized_title = _simple_title_optimization(title)
        return {"title": optimized_title, "seo_meta": "", "tags": []}
    
    try:
        # Truncate content if too long (keep first 2000 chars for context)
        content_preview = content[:2000] if content else ""
        summary_text = summary if summary else ""
        
        prompt = SEO_PROMPT_TEMPLATE.format(
            title=title or "Untitled Blog Post",
            summary=summary_text,
            content=content_preview
        )
        
        print(f"[SEOOptimizerAgent] Optimizing title: '{title}'")
        response = groq.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Clean response text (remove markdown code blocks if present)
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        elif response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON response
        data = safe_json_parse(response_text, {})
        
        # Validate and ensure required fields exist
        optimized_title = data.get("title", "").strip()
        
        # If no title in response, try alternative keys
        if not optimized_title:
            optimized_title = (
                data.get("optimized_title", "") or
                data.get("seo_title", "") or
                data.get("new_title", "") or
                title
            ).strip()
        
        # Final validation - if still empty or same as original, use simple optimization
        if not optimized_title or optimized_title == title.strip():
            print(f"[SEOOptimizerAgent] Using fallback optimization for title")
            optimized_title = _simple_title_optimization(title)
        
        # Ensure title is reasonable length
        if len(optimized_title) > 70:
            optimized_title = optimized_title[:67] + "..."
        
        seo_meta = data.get("seo_meta", data.get("meta_description", data.get("description", "")))
        tags = data.get("tags", [])
        if not isinstance(tags, list):
            tags = []
        
        result = {
            "title": optimized_title.strip(),
            "seo_meta": seo_meta.strip() if seo_meta else "",
            "tags": tags[:10]  # Limit to 10 tags
        }
        
        print(f"[SEOOptimizerAgent] ✅ Optimized title: '{result['title']}' (original: '{title}')")
        return result
        
    except Exception as e:
        import traceback
        print(f"[SEOOptimizerAgent] Error optimizing blog: {e}")
        print(traceback.format_exc())
        # Use fallback optimization on error
        optimized_title = _simple_title_optimization(title)
        return {"title": optimized_title, "seo_meta": "", "tags": []}
