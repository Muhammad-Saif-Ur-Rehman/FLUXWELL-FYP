# ai_blog_agents/utils/helpers.py
import json

def safe_json_parse(raw_text: str, default: dict = None) -> dict:
    default = default or {}
    try:
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        return json.loads(raw_text[start:end+1])
    except Exception:
        return default
