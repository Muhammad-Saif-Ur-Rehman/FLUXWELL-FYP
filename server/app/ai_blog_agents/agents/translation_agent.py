# ai_blog_agents/agents/translation_agent.py
import os
from langchain_groq import ChatGroq
from app.ai_blog_agents.agents.base_agent import BaseAgent

class TranslationAgent(BaseAgent):
    """
    Translates blog content to different languages.
    """
    
    def __init__(self):
        super().__init__()
    
    async def translate(self, content: str, target_language: str = "es", source_language: str = "en", title: str = None):
        """
        Translates content and title to target language.
        
        Args:
            content: Text to translate (includes markdown headings)
            target_language: Target language code (e.g., 'es', 'fr', 'de')
            source_language: Source language code (default: 'en')
            title: Optional blog title to translate
        
        Returns:
            Dictionary with translated_content and translated_title
        """
        if not self.model:
            return {
                "translated_content": content,
                "translated_title": title,
                "error": "Model not initialized",
                "success": False
            }
        
        try:
            language_names = {
                "en": "English",
                "es": "Spanish",
                "fr": "French",
                "de": "German",
                "it": "Italian",
                "pt": "Portuguese",
                "zh": "Chinese",
                "ja": "Japanese",
                "ko": "Korean",
                "ar": "Arabic",
                "ru": "Russian",
                "hi": "Hindi"
            }
            
            target_lang_name = language_names.get(target_language.lower(), target_language)
            source_lang_name = language_names.get(source_language.lower(), source_language)
            
            # Build comprehensive prompt that explicitly instructs to translate headings and title
            prompt_parts = [
                f"You are a professional translator. Translate the following blog content from {source_lang_name} to {target_lang_name}.",
                "",
                "CRITICAL TRANSLATION RULES - READ CAREFULLY:",
                "",
                "1. TRANSLATE EVERYTHING:",
                "   ✓ Blog title (if provided above)",
                "   ✓ ALL markdown headings (# Heading, ## Heading, ### Heading, etc.)",
                "   ✓ ALL paragraph text",
                "   ✓ ALL list items (- item, * item, 1. item)",
                "   ✓ ALL content text",
                "",
                "2. PRESERVE MARKDOWN STRUCTURE EXACTLY:",
                "   ✓ Keep ALL markdown symbols: #, ##, ###, **, *, -, 1., etc.",
                "   ✓ Only translate the TEXT after markdown symbols",
                "   ✓ Example: '## Introduction' → '## Introducción' (Spanish) or '## Introduction' (French)",
                "   ✓ Example: '### Key Points' → '### Points Clés' (French)",
                "   ✓ Preserve line breaks, spacing, and formatting",
                "",
                "3. HEADING TRANSLATION EXAMPLES:",
                "   Original: ## The Benefits of Exercise",
                f"   {target_lang_name}: ## [Translated version of 'The Benefits of Exercise']",
                "",
                "   Original: ### How to Get Started",
                f"   {target_lang_name}: ### [Translated version of 'How to Get Started']",
                "",
                "4. DO NOT TRANSLATE:",
                "   ✗ Code blocks (```code```)",
                "   ✗ URLs (http://, https://)",
                "   ✗ Technical terms that are universal (API, HTML, CSS, etc.)",
                "",
                "5. MAINTAIN:",
                "   ✓ Original tone and style",
                "   ✓ Professional language",
                "   ✓ All formatting and structure",
                ""
            ]
            
            if title:
                prompt_parts.append(f"BLOG TITLE (translate this): {title}")
                prompt_parts.append("")
            
            # Use full content for translation (AI models can handle reasonable lengths)
            # For very long content (>10000 chars), we'll let the model handle it
            if len(content) > 10000:
                print(f"[TranslationAgent] Warning: Very long content ({len(content)} chars), translation may take longer")
            
            prompt_parts.extend([
                "BLOG CONTENT (translate everything including headings):",
                content,
                "",
                f"Provide the complete translated content in {target_lang_name}, maintaining all markdown formatting:"
            ])
            
            prompt = "\n".join(prompt_parts)
            
            print(f"[TranslationAgent] Translating to {target_lang_name}...")
            if title:
                print(f"[TranslationAgent] Title to translate: '{title}'")
            print(f"[TranslationAgent] Content length: {len(content)} characters")
            
            response = self.run_prompt(prompt)
            
            if response:
                translated_content = response.strip()
                translated_title = None
                
                # If title was provided, translate it separately for better accuracy
                if title:
                    title_prompt = f"""Translate ONLY the blog title from {source_lang_name} to {target_lang_name}.

Original Title: {title}

Instructions:
- Translate the title naturally and accurately
- Maintain the same tone and style
- Keep it engaging and SEO-friendly
- Return ONLY the translated title, nothing else
- Do NOT include any prefixes like "Translated title:" or "Title:"
- Do NOT include any markdown formatting

Translated Title:"""
                    
                    print(f"[TranslationAgent] Translating title separately...")
                    title_response = self.run_prompt(title_prompt)
                    if title_response:
                        translated_title = title_response.strip()
                        
                        # Clean up response - remove common prefixes and markdown
                        cleanup_patterns = [
                            "Translated title:",
                            "Title:",
                            "Translated:",
                            "#",
                            "**",
                            "*"
                        ]
                        for pattern in cleanup_patterns:
                            if translated_title.startswith(pattern):
                                translated_title = translated_title[len(pattern):].strip()
                            if translated_title.endswith(pattern):
                                translated_title = translated_title[:-len(pattern)].strip()
                        
                        # Remove quotes if present
                        translated_title = translated_title.strip('"').strip("'").strip()
                        
                        # Final validation
                        if not translated_title or len(translated_title) < 3:
                            print(f"[TranslationAgent] Warning: Title translation seems invalid, using original")
                            translated_title = title
                        else:
                            print(f"[TranslationAgent] ✅ Translated title: '{translated_title}' (original: '{title}')")
                    else:
                        print(f"[TranslationAgent] Warning: No title translation response, using original")
                        translated_title = title
                
                return {
                    "translated_content": translated_content,
                    "translated_title": translated_title,
                    "source_language": source_language,
                    "target_language": target_language,
                    "success": True
                }
            else:
                return {
                    "translated_content": content,
                    "translated_title": title,
                    "error": "Translation failed - no response from model",
                    "success": False
                }
        except Exception as e:
            import traceback
            print(f"[TranslationAgent] Error: {str(e)}")
            print(traceback.format_exc())
            return {
                "translated_content": content,
                "translated_title": title,
                "error": str(e),
                "success": False
            }

