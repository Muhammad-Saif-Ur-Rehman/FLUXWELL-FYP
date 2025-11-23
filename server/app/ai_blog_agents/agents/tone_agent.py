# ai_blog_agents/agents/tone_agent.py
from app.ai_blog_agents.agents.base_agent import BaseAgent

class ToneAgent(BaseAgent):
    """
    Adjusts the tone of blog content (e.g., professional, casual, friendly, authoritative).
    """
    
    def __init__(self):
        super().__init__()
    
    async def adjust_tone(self, content: str, target_tone: str = "professional", title: str = ""):
        """
        Adjusts the tone of blog content.
        
        Args:
            content: Blog content to adjust
            target_tone: Desired tone (professional, casual, friendly, authoritative, conversational, etc.)
            title: Blog title (optional, for context)
        
        Returns:
            Content with adjusted tone
        """
        if not self.model:
            return {"adjusted_content": content, "error": "Model not initialized"}
        
        try:
            tone_guidelines = {
                "professional": "Use formal language, avoid contractions, maintain a serious and respectful tone",
                "casual": "Use conversational language, contractions are fine, be relaxed and approachable",
                "friendly": "Be warm and welcoming, use inclusive language, create a sense of connection",
                "authoritative": "Be confident and knowledgeable, use strong statements, demonstrate expertise",
                "conversational": "Write as if speaking to a friend, use natural language, be engaging",
                "academic": "Use formal academic language, cite sources appropriately, maintain objectivity"
            }
            
            guidelines = tone_guidelines.get(target_tone.lower(), tone_guidelines["professional"])
            
            prompt = f"""You are an expert content editor. Adjust the tone of the following blog content to be {target_tone}.

Guidelines for {target_tone} tone:
{guidelines}

Important:
- Maintain the original meaning and key information
- Preserve any markdown formatting
- Keep the structure and organization
- Only change the tone, not the content itself

{'Title: ' + title if title else ''}

Original Content:
{content}

Adjusted Content:"""
            
            response = self.run_prompt(prompt)
            
            if response:
                return {
                    "adjusted_content": response,
                    "target_tone": target_tone,
                    "success": True
                }
            else:
                return {
                    "adjusted_content": content,
                    "error": "Tone adjustment failed",
                    "success": False
                }
        except Exception as e:
            print(f"[ToneAgent] Error: {str(e)}")
            return {
                "adjusted_content": content,
                "error": str(e),
                "success": False
            }

