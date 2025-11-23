# ai_blog_agents/agents/blog_planner_agent.py
import json
from app.ai_blog_agents.agents.base_agent import BaseAgent
from app.ai_blog_agents.tools.content_plan_tool import generate_mindmap
from app.ai_blog_agents.utils.helpers import safe_json_parse

class BlogPlannerAgent(BaseAgent):
    """
    Creates a structured blog plan (outline + mindmap) for the BlogWriterAgent.
    """

    def __init__(self):
        super().__init__()
        self.prompt_template = self.load_prompt("blog_generation_prompt.txt")

    async def plan_blog(self, topic: str):
        """
        Creates a detailed blog outline.
        """
        try:
            # Step 1: Use the content_plan_tool to generate a structural outline
            mindmap = generate_mindmap(topic)

            # Step 2: Build the planning prompt for the model
            prompt = self.prompt_template.format(
                title=mindmap["title"],
                description=mindmap["description"],
                sections=json.dumps(mindmap["sections"], indent=2)
            )

            # Step 3: Get AI feedback on the structure (optional enrichment)
            ai_feedback = self.run_prompt(prompt)

            # Step 4: Combine mindmap and feedback into one structure
            plan_data = {
                "topic": topic,
                "mindmap": mindmap,
                "ai_feedback": ai_feedback
            }

            return safe_json_parse(json.dumps(plan_data), plan_data)
        except Exception as e:
            print(f"[BlogPlannerAgent] Planning error: {str(e)}")
            return None
