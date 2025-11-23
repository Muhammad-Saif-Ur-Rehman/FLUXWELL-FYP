# ai_blog_agents/agents/readability_agent.py
from app.ai_blog_agents.agents.base_agent import BaseAgent

class ReadabilityAgent(BaseAgent):
    """
    Improves content readability by simplifying language, improving flow, and enhancing clarity.
    """
    
    def __init__(self):
        super().__init__()
    
    async def improve_readability(self, content: str, title: str = ""):
        """
        Improves the readability of blog content.
        
        Args:
            content: Blog content to improve
            title: Blog title (optional, for context)
        
        Returns:
            Improved content with better readability
        """
        if not self.model:
            return {"improved_content": content, "error": "Model not initialized"}
        
        try:
            prompt = f"""You are an expert content editor. Improve the readability of the following blog content.
Make it clearer, more engaging, and easier to understand while maintaining the original meaning and tone.

Guidelines:
- Simplify complex sentences
- Break up long paragraphs
- Use active voice where possible
- Improve flow and transitions
- Maintain the original style and voice
- Keep technical terms if they're essential
- Preserve any markdown formatting

{'Title: ' + title if title else ''}

Original Content:
{content}

Improved Content:"""
            
            response = self.run_prompt(prompt)
            
            if response:
                return {
                    "improved_content": response,
                    "success": True
                }
            else:
                return {
                    "improved_content": content,
                    "error": "Readability improvement failed",
                    "success": False
                }
        except Exception as e:
            print(f"[ReadabilityAgent] Error: {str(e)}")
            return {
                "improved_content": content,
                "error": str(e),
                "success": False
            }

