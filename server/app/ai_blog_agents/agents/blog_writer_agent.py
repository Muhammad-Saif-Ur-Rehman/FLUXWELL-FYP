# ai_blog_agents/agents/blog_writer_agent.py
import json
import os
from pathlib import Path
from langchain_groq import ChatGroq
from app.ai_blog_agents.tools.content_plan_tool import generate_mindmap
from app.ai_blog_agents.utils.helpers import safe_json_parse

# Load blog generation prompt template
PROMPT_PATH = Path(__file__).parent.parent / "utils" / "prompts" / "blog_generation_prompt.txt"
with open(PROMPT_PATH, "r") as f:
    BLOG_PROMPT_TEMPLATE = f.read()

# Initialize ChatGroq with API key
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        groq = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
    else:
        groq = None
        print("[BlogWriterAgent] Warning: GROQ_API_KEY not set")
except Exception as e:
    groq = None
    print(f"[BlogWriterAgent] Warning: Failed to initialize ChatGroq: {e}")

async def generate_blog(topic: str):
    """
    Generates a full blog using AI and a mindmap plan.
    """
    if not groq:
        mindmap = generate_mindmap(topic)
        return {
            "topic": topic,
            "mindmap": mindmap,
            "content": ""
        }
    
    try:
        mindmap = generate_mindmap(topic)
        prompt = BLOG_PROMPT_TEMPLATE.format(
            title=mindmap["title"],
            description=mindmap["description"],
            sections=json.dumps(mindmap["sections"], indent=2)
        )
        response = groq.invoke(prompt)
        return {
            "topic": topic,
            "mindmap": mindmap,
            "content": response.content if response else ""
        }
    except Exception as e:
        print(f"[BlogWriterAgent] Error: {e}")
        mindmap = generate_mindmap(topic)
        return {
            "topic": topic,
            "mindmap": mindmap,
            "content": ""
        }
