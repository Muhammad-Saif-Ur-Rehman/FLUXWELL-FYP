# ai_blog_agents/tools/nlp_tool.py
from typing import List, Tuple
import re

def optimize_title(title: str) -> str:
    # Simple example: capitalize words
    return " ".join(word.capitalize() for word in title.split())

def extract_keywords(text: str, max_keywords: int = 5) -> List[str]:
    words = re.findall(r'\b\w+\b', text.lower())
    freq = {}
    for word in words:
        if len(word) > 3:
            freq[word] = freq.get(word, 0) + 1
    # return top max_keywords
    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [k for k, v in sorted_keywords[:max_keywords]]
