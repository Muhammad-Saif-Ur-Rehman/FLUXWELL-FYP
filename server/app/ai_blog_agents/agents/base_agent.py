# ai_blog_agents/agents/base_agent.py
from pathlib import Path
import os
from langchain_groq import ChatGroq

class BaseAgent:
    """
    Base class for all AI agents in FluxWell Blog Module.
    Provides standardized access to Groq model and prompt loading.
    """
    def __init__(self, model_name: str = "openai/gpt-oss-20b"):
        try:
            groq_api_key = os.getenv("GROQ_API_KEY")
            if not groq_api_key:
                raise ValueError("GROQ_API_KEY environment variable not set")
            self.model = ChatGroq(model=model_name, api_key=groq_api_key)
        except Exception as e:
            print(f"[BaseAgent] Warning: Failed to initialize ChatGroq: {e}")
            self.model = None

    def load_prompt(self, prompt_filename: str) -> str:
        """
        Loads a text prompt template from utils/prompts.
        """
        prompt_path = Path(__file__).parent.parent / "utils" / "prompts" / prompt_filename
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {prompt_filename}")
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()

    def run_prompt(self, prompt: str):
        """
        Executes a prompt on the model and returns content.
        """
        try:
            if self.model is None:
                print("[BaseAgent] Model not initialized, returning None")
                return None
            response = self.model.invoke(prompt)
            return response.content
        except Exception as e:
            print(f"[BaseAgent] Model error: {str(e)}")
            return None
