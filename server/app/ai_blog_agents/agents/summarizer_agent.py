# ai_blog_agents/agents/summarizer_agent.py
from pathlib import Path
import os
from langchain_groq import ChatGroq
from app.ai_blog_agents.utils.helpers import safe_json_parse

PROMPT_PATH = Path(__file__).parent.parent / "utils" / "prompts" / "summary_prompt.txt"
with open(PROMPT_PATH, "r") as f:
    SUMMARY_PROMPT_TEMPLATE = f.read()

# Initialize ChatGroq with API key
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        groq = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
    else:
        groq = None
        print("[SummarizerAgent] Warning: GROQ_API_KEY not set")
except Exception as e:
    groq = None
    print(f"[SummarizerAgent] Warning: Failed to initialize ChatGroq: {e}")

async def summarize_blog(title: str, content: str):
    """
    Creates a concise summary + keywords for a blog.
    """
    if not groq:
        return {"summary": "", "keywords": []}
    
    try:
        prompt = SUMMARY_PROMPT_TEMPLATE.format(title=title, content=content)
        response = groq.invoke(prompt)
        data = safe_json_parse(response.content, {})
        return data
    except Exception as e:
        print(f"[SummarizerAgent] Error: {e}")
        return {"summary": "", "keywords": []}
