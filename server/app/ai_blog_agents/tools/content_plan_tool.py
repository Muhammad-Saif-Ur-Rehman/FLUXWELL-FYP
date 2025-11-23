# ai_blog_agents/tools/content_plan_tool.py
from typing import Dict, List
import os
from langchain_groq import ChatGroq
import json

# Initialize ChatGroq for AI-powered mindmap generation
groq = None
try:
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        groq = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
except Exception as e:
    print(f"[ContentPlanTool] Warning: Failed to initialize ChatGroq: {e}")

def generate_mindmap(topic: str) -> Dict:
    """
    Generates a comprehensive blog outline/mindmap using AI for the given topic.
    Returns a structured outline with sections, subsections, and tags.
    """
    if not groq:
        # Fallback to basic structure if AI is not available
        return {
            "title": f"{topic} - Complete Guide",
            "description": f"A comprehensive guide covering all aspects of {topic}.",
            "sections": [
                {"title": "Introduction", "subsections": [{"title": "What is it?"}, {"title": "Why it matters"}]},
                {"title": "Key Concepts", "subsections": [{"title": "Core principles"}, {"title": "Important factors"}]},
                {"title": "Practical Applications", "subsections": [{"title": "How to get started"}, {"title": "Best practices"}]},
                {"title": "Conclusion", "subsections": [{"title": "Key takeaways"}, {"title": "Next steps"}]}
            ],
            "tags": [topic.lower().replace(" ", "-"), "guide", "tutorial"]
        }
    
    try:
        prompt = f"""Generate a comprehensive blog outline for the topic: "{topic}"

Create a detailed structure with:
1. An engaging, SEO-friendly title
2. A brief description (1-2 sentences)
3. 4-6 main sections, each with 2-4 relevant subsections
4. 3-5 relevant tags

Format your response as JSON:
{{
  "title": "Engaging Blog Title",
  "description": "Brief description of what the blog will cover",
  "sections": [
    {{
      "title": "Section Title",
      "subsections": [
        {{"title": "Subsection 1"}},
        {{"title": "Subsection 2"}}
      ]
    }}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}}

Make sure the outline is comprehensive, well-organized, and covers the topic thoroughly.
Return ONLY valid JSON, no markdown formatting or additional text.

Topic: {topic}
JSON:"""
        
        response = groq.invoke(prompt)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Clean up response (remove markdown code blocks if present)
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON
        try:
            mindmap = json.loads(response_text)
            
            # Ensure required fields exist
            if "title" not in mindmap:
                mindmap["title"] = f"{topic} - Complete Guide"
            if "description" not in mindmap:
                mindmap["description"] = f"A comprehensive guide on {topic}."
            if "sections" not in mindmap or not mindmap["sections"]:
                mindmap["sections"] = [
                    {"title": "Introduction", "subsections": [{"title": "Overview"}]},
                    {"title": "Main Content", "subsections": [{"title": "Key Points"}]},
                    {"title": "Conclusion", "subsections": [{"title": "Summary"}]}
                ]
            if "tags" not in mindmap or not mindmap["tags"]:
                mindmap["tags"] = [topic.lower().replace(" ", "-"), "guide"]
            
            return mindmap
        except json.JSONDecodeError as e:
            print(f"[ContentPlanTool] JSON parse error: {e}")
            print(f"[ContentPlanTool] Response text: {response_text[:200]}")
            # Return fallback structure
            return {
                "title": f"{topic} - Complete Guide",
                "description": f"A comprehensive guide covering all aspects of {topic}.",
                "sections": [
                    {"title": "Introduction", "subsections": [{"title": "Overview"}]},
                    {"title": "Main Content", "subsections": [{"title": "Key Points"}]},
                    {"title": "Conclusion", "subsections": [{"title": "Summary"}]}
                ],
                "tags": [topic.lower().replace(" ", "-"), "guide"]
            }
    except Exception as e:
        print(f"[ContentPlanTool] Error generating mindmap: {e}")
        # Return fallback structure
        return {
            "title": f"{topic} - Complete Guide",
            "description": f"A comprehensive guide covering all aspects of {topic}.",
            "sections": [
                {"title": "Introduction", "subsections": [{"title": "Overview"}]},
                {"title": "Main Content", "subsections": [{"title": "Key Points"}]},
                {"title": "Conclusion", "subsections": [{"title": "Summary"}]}
            ],
            "tags": [topic.lower().replace(" ", "-"), "guide"]
        }
