# ai_blog_agents/tools/image_suggestion_tool.py
import os
import json
import requests
import time
import re
from typing import Dict, List, Optional
from urllib.parse import quote
import base64
from datetime import datetime, timedelta
from threading import Lock

# Initialize Gemini API for prompt generation
gemini_model = None
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_api_key)
            gemini_model = genai.GenerativeModel('gemini-pro')
        except ImportError:
            print("[ImageSuggestionTool] Warning: google-generativeai package not installed. Install with: pip install google-generativeai")
        except Exception as e:
            print(f"[ImageSuggestionTool] Warning: Failed to initialize Gemini: {e}")
    else:
        print("[ImageSuggestionTool] Warning: GEMINI_API_KEY not set")
except Exception as e:
    print(f"[ImageSuggestionTool] Warning: {e}")

# Groq API rate limiting
groq_model = None
groq_rate_limiter = {
    'last_request_time': None,
    'request_count': 0,
    'window_start': datetime.now(),
    'lock': Lock(),
    'cache': {}  # Simple cache for prompts
}
GROQ_RATE_LIMIT = 30  # requests per minute
GROQ_MIN_INTERVAL = 2.0  # minimum seconds between requests

def _get_groq_model():
    """Lazy initialization of Groq model with rate limiting awareness"""
    global groq_model
    if groq_model is None:
        try:
            groq_api_key = os.getenv("GROQ_API_KEY")
            if groq_api_key:
                try:
                    from langchain_groq import ChatGroq
                    groq_model = ChatGroq(model="openai/gpt-oss-20b", api_key=groq_api_key)
                except ImportError:
                    print("[ImageSuggestionTool] Warning: langchain-groq package not installed")
                except Exception as e:
                    print(f"[ImageSuggestionTool] Warning: Failed to initialize Groq: {e}")
            else:
                print("[ImageSuggestionTool] Warning: GROQ_API_KEY not set")
        except Exception as e:
            print(f"[ImageSuggestionTool] Warning: {e}")
    return groq_model

def _check_groq_rate_limit() -> bool:
    """Check if we can make a Groq API request (rate limiting)"""
    with groq_rate_limiter['lock']:
        now = datetime.now()
        
        # Reset window if a minute has passed
        if (now - groq_rate_limiter['window_start']).total_seconds() > 60:
            groq_rate_limiter['request_count'] = 0
            groq_rate_limiter['window_start'] = now
        
        # Check if we've exceeded rate limit
        if groq_rate_limiter['request_count'] >= GROQ_RATE_LIMIT:
            wait_time = 60 - (now - groq_rate_limiter['window_start']).total_seconds()
            if wait_time > 0:
                print(f"[ImageSuggestionTool] ⚠️ Groq rate limit reached. Waiting {wait_time:.1f}s...")
                return False
        
        # Check minimum interval
        if groq_rate_limiter['last_request_time']:
            time_since_last = (now - groq_rate_limiter['last_request_time']).total_seconds()
            if time_since_last < GROQ_MIN_INTERVAL:
                sleep_time = GROQ_MIN_INTERVAL - time_since_last
                time.sleep(sleep_time)
        
        groq_rate_limiter['last_request_time'] = datetime.now()
        groq_rate_limiter['request_count'] += 1
        return True

def _get_cached_prompt(content_hash: str) -> Optional[List[Dict]]:
    """Get cached prompt suggestions"""
    return groq_rate_limiter['cache'].get(content_hash)

def _cache_prompt(content_hash: str, suggestions: List[Dict]):
    """Cache prompt suggestions (limit cache size)"""
    if len(groq_rate_limiter['cache']) > 50:  # Limit cache size
        # Remove oldest entry
        oldest_key = next(iter(groq_rate_limiter['cache']))
        del groq_rate_limiter['cache'][oldest_key]
    groq_rate_limiter['cache'][content_hash] = suggestions

# Pollinations.ai API base URL
POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt/"

def _clean_prompt(prompt: str) -> str:
    """
    Cleans and optimizes the prompt for Pollinations.ai API.
    Makes prompts simple, direct, and under 100 characters for better success rate.
    """
    # Remove markdown formatting
    prompt = re.sub(r'[*_`#\[\]()]', '', prompt)
    # Remove extra whitespace
    prompt = ' '.join(prompt.split())
    # Remove common AI generation phrases that make prompts complex
    prompt = re.sub(r'\b(detailed|highly detailed|extremely detailed|very detailed|professional|amazing|stunning|beautiful|gorgeous|incredible)\b', '', prompt, flags=re.IGNORECASE)
    # Limit prompt length to 100 chars for better success (Pollinations.ai works better with shorter prompts)
    if len(prompt) > 100:
        # Take first 100 chars at word boundary
        prompt = prompt[:100].rsplit(' ', 1)[0]
    # Remove problematic characters but keep basic punctuation
    prompt = re.sub(r'[^\w\s\-,.!?]', '', prompt)
    # Remove multiple spaces
    prompt = ' '.join(prompt.split())
    return prompt.strip()

def generate_image_with_pollinations(prompt: str, max_retries: int = 2) -> Optional[str]:
    """
    Generates an image using Pollinations.ai API with retry logic.
    
    Args:
        prompt: Image generation prompt
        max_retries: Maximum number of retry attempts
        
    Returns:
        Image data URL (base64) or None if generation fails
    """
    # Clean and optimize the prompt
    cleaned_prompt = _clean_prompt(prompt)
    
    if not cleaned_prompt:
        print(f"[ImageSuggestionTool] ❌ Error: Empty prompt after cleaning")
        return None
    
    for attempt in range(max_retries + 1):
        try:
            # URL encode the prompt
            encoded_prompt = quote(cleaned_prompt)
            # Construct the full URL with model parameter
            full_url = f"{POLLINATIONS_BASE_URL}{encoded_prompt}?model=flux"
            
            if attempt > 0:
                # Wait before retry (exponential backoff)
                wait_time = 2 ** attempt
                print(f"[ImageSuggestionTool] Retry attempt {attempt}/{max_retries} after {wait_time}s...")
                time.sleep(wait_time)
            
            print(f"[ImageSuggestionTool] Requesting image from Pollinations.ai (attempt {attempt + 1})")
            print(f"[ImageSuggestionTool] Prompt: {cleaned_prompt[:60]}...")
            
            # Make GET request to fetch the image with longer timeout
            response = requests.get(full_url, stream=True, timeout=90, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            
            if response.status_code == 200:
                # Check content type
                content_type = response.headers.get('Content-Type', '')
                if 'image' not in content_type.lower():
                    print(f"[ImageSuggestionTool] ⚠️ Warning: Unexpected content type: {content_type}")
                
                # Get image content
                image_content = response.content
                
                # Check if we got actual image data (at least 1KB)
                if len(image_content) > 1024:
                    # Verify it's actually an image by checking magic bytes
                    if image_content.startswith(b'\x89PNG') or image_content.startswith(b'\xff\xd8\xff'):
                        # Convert image to base64 data URL for frontend display
                        image_base64 = base64.b64encode(image_content).decode('utf-8')
                        image_data_url = f"data:image/png;base64,{image_base64}"
                        print(f"[ImageSuggestionTool] ✅ Image generated successfully ({len(image_content) / 1024:.2f} KB)")
                        return image_data_url
                    else:
                        print(f"[ImageSuggestionTool] ⚠️ Warning: Response doesn't appear to be an image")
                        if attempt < max_retries:
                            continue
                else:
                    print(f"[ImageSuggestionTool] ❌ Error: Image too small ({len(image_content)} bytes)")
                    if attempt < max_retries:
                        continue
            elif response.status_code == 500:
                print(f"[ImageSuggestionTool] ❌ Error: Server error (500) - API might be overloaded or prompt invalid")
                if attempt < max_retries:
                    # Try with a simpler prompt on retry
                    if attempt == 1:
                        # Simplify prompt for retry
                        words = cleaned_prompt.split()[:10]  # Take first 10 words
                        cleaned_prompt = ' '.join(words)
                        print(f"[ImageSuggestionTool] Trying with simplified prompt: {cleaned_prompt}")
                    continue
            elif response.status_code == 404:
                print(f"[ImageSuggestionTool] ❌ Error: 404 Not Found")
                return None
            elif response.status_code == 429:
                print(f"[ImageSuggestionTool] ❌ Error: Rate limited (429)")
                if attempt < max_retries:
                    wait_time = 5 * (attempt + 1)
                    print(f"[ImageSuggestionTool] Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    continue
            else:
                print(f"[ImageSuggestionTool] ❌ Error: Failed to retrieve image. Status code: {response.status_code}")
                if attempt < max_retries:
                    continue
                    
        except requests.exceptions.Timeout:
            print(f"[ImageSuggestionTool] ❌ Error: Request timeout (90s)")
            if attempt < max_retries:
                continue
        except requests.exceptions.RequestException as e:
            print(f"[ImageSuggestionTool] ❌ Error during request: {e}")
            if attempt < max_retries:
                continue
        except Exception as e:
            print(f"[ImageSuggestionTool] ❌ Unexpected error: {e}")
            if attempt < max_retries:
                continue
    
    return None

def generate_image_suggestions(content: str, title: str = "") -> Dict:
    """
    Uses Gemini API to generate image prompts for blog content.
    Then uses Pollinations.ai API for image generation.

    Args:
        content: Blog content
        title: Blog title (optional)

    Returns:
        Dictionary with image suggestions and generated image URLs
    """
    try:
        images = []
        
        # Step 1: Generate image prompts using Gemini (primary) or Groq (fallback)
        suggestions = []
        prompt_generated = False
        
        # Try Gemini first
        if gemini_model:
            try:
                prompt = f"""Create exactly 3 simple image prompts for this blog.

Title: {title if title else 'Blog post'}
Content: {content[:1500]}

Return JSON array:
[
  {{"title": "Image 1", "prompt": "simple prompt under 80 chars", "placement": "header", "description": "what it shows"}},
  {{"title": "Image 2", "prompt": "simple prompt under 80 chars", "placement": "content", "description": "what it shows"}},
  {{"title": "Image 3", "prompt": "simple prompt under 80 chars", "placement": "content", "description": "what it shows"}}
]

Keep prompts SHORT (under 80 chars), SIMPLE, direct. Return ONLY JSON."""
                
                response = gemini_model.generate_content(prompt)
                suggestions_text = response.text.strip()
                
                # Remove markdown code blocks if present
                if suggestions_text.startswith("```json"):
                    suggestions_text = suggestions_text[7:]
                if suggestions_text.startswith("```"):
                    suggestions_text = suggestions_text[3:]
                if suggestions_text.endswith("```"):
                    suggestions_text = suggestions_text[:-3]
                suggestions_text = suggestions_text.strip()
                
                try:
                    suggestions = json.loads(suggestions_text)
                    if not isinstance(suggestions, list):
                        suggestions = [suggestions]
                    if len(suggestions) > 0:
                        prompt_generated = True
                        print(f"[ImageSuggestionTool] ✅ Generated {len(suggestions)} prompts using Gemini")
                except json.JSONDecodeError as e:
                    print(f"[ImageSuggestionTool] Gemini JSON parse error: {e}")
                    print(f"[ImageSuggestionTool] Response text: {suggestions_text[:200]}")
            except Exception as e:
                print(f"[ImageSuggestionTool] Gemini error: {e}")
        
        # Fallback to Groq if Gemini failed (with rate limiting and caching)
        if not prompt_generated:
            # Check cache first
            import hashlib
            content_hash = hashlib.md5(f"{title}_{content[:500]}".encode()).hexdigest()
            cached_suggestions = _get_cached_prompt(content_hash)
            
            if cached_suggestions:
                suggestions = cached_suggestions
                prompt_generated = True
                print(f"[ImageSuggestionTool] ✅ Using cached prompts ({len(suggestions)} suggestions)")
            else:
                groq = _get_groq_model()
                if groq and _check_groq_rate_limit():
                    try:
                        print(f"[ImageSuggestionTool] Using Groq for prompt generation (with rate limiting)...")
                        # Simplified prompt - ask for simple, short prompts
                        prompt = f"""Create exactly 3 simple image prompts for this blog.

Title: {title if title else 'Blog post'}
Content: {content[:1000]}

Return JSON array:
[
  {{"title": "Image 1", "prompt": "simple prompt under 80 chars", "placement": "header", "description": "what it shows"}},
  {{"title": "Image 2", "prompt": "simple prompt under 80 chars", "placement": "content", "description": "what it shows"}},
  {{"title": "Image 3", "prompt": "simple prompt under 80 chars", "placement": "content", "description": "what it shows"}}
]

Keep prompts SHORT (under 80 chars), SIMPLE, direct. Return ONLY JSON."""
                        
                        response = groq.invoke(prompt)
                        suggestions_text = response.content if hasattr(response, 'content') else str(response)
                        suggestions_text = suggestions_text.strip()
                        
                        # Remove markdown code blocks if present
                        if suggestions_text.startswith("```json"):
                            suggestions_text = suggestions_text[7:]
                        if suggestions_text.startswith("```"):
                            suggestions_text = suggestions_text[3:]
                        if suggestions_text.endswith("```"):
                            suggestions_text = suggestions_text[:-3]
                        suggestions_text = suggestions_text.strip()
                        
                        try:
                            suggestions = json.loads(suggestions_text)
                            if not isinstance(suggestions, list):
                                suggestions = [suggestions]
                            if len(suggestions) > 0:
                                prompt_generated = True
                                _cache_prompt(content_hash, suggestions)
                                print(f"[ImageSuggestionTool] ✅ Generated {len(suggestions)} prompts using Groq")
                        except json.JSONDecodeError as e:
                            print(f"[ImageSuggestionTool] Groq JSON parse error: {e}")
                            print(f"[ImageSuggestionTool] Response text: {suggestions_text[:200]}")
                    except Exception as e:
                        error_msg = str(e)
                        if 'rate limit' in error_msg.lower() or '429' in error_msg:
                            print(f"[ImageSuggestionTool] ⚠️ Groq rate limit hit. Using fallback prompts.")
                        else:
                            print(f"[ImageSuggestionTool] Groq error: {e}")
                else:
                    if groq:
                        print(f"[ImageSuggestionTool] ⚠️ Groq rate limit reached. Using fallback prompts.")
        
        # Final fallback: create suggestions from content
        if not prompt_generated:
            print(f"[ImageSuggestionTool] Using fallback prompt generation from content")
            suggestions = _create_fallback_suggestions(content, title)
        
        # Step 2: Generate images using Pollinations.ai
        print(f"[ImageSuggestionTool] Generating {min(len(suggestions), 3)} images using Pollinations.ai...")
        successful_images = 0
        
        for idx, suggestion in enumerate(suggestions[:3], 1):  # Limit to 3 images to avoid rate limits
            try:
                # Use the prompt field if available, otherwise use description
                image_prompt = suggestion.get("prompt") or suggestion.get("description", "")
                
                if not image_prompt:
                    # Create a prompt from title and description
                    title_text = suggestion.get("title", "")
                    desc_text = suggestion.get("description", "")
                    image_prompt = f"{title_text}, {desc_text}, digital art, high detail, professional"
                
                # Ensure prompt is clean and optimized
                image_prompt = _clean_prompt(image_prompt)
                
                if not image_prompt:
                    print(f"[ImageSuggestionTool] ⚠️ Skipping image {idx}: Empty prompt after cleaning")
                    continue
                
                print(f"[ImageSuggestionTool] Generating image {idx}/{min(len(suggestions), 3)}: {image_prompt[:60]}...")
                
                # Generate image using Pollinations.ai with retry logic
                image_url = generate_image_with_pollinations(image_prompt, max_retries=2)
                
                if image_url:
                    images.append({
                        "url": image_url,
                        "title": suggestion.get("title", f"Image {idx}"),
                        "description": suggestion.get("description", ""),
                        "prompt": image_prompt,
                        "placement": suggestion.get("placement", ""),
                        "style": suggestion.get("style", "")
                    })
                    suggestion["image_url"] = image_url
                    successful_images += 1
                    print(f"[ImageSuggestionTool] ✅ Image {idx} generated successfully ({successful_images}/{min(len(suggestions), 3)})")
                    
                    # Small delay between requests to avoid rate limiting
                    if idx < min(len(suggestions), 3):
                        time.sleep(1)
                else:
                    print(f"[ImageSuggestionTool] ⚠️ Failed to generate image {idx} after retries")
                    
            except Exception as e:
                import traceback
                print(f"[ImageSuggestionTool] Error generating image {idx}: {e}")
                print(traceback.format_exc())
                continue
        
        return {
            "suggestions": suggestions,
            "images": images,
            "success": len(images) > 0,
            "generated_count": len(images),
            "total_suggestions": len(suggestions)
        }
        
    except Exception as e:
        import traceback
        print(f"[ImageSuggestionTool] Overall error: {str(e)}")
        print(traceback.format_exc())
        return {
            "suggestions": [],
            "images": [],
            "error": str(e),
            "success": False
        }

def _create_fallback_suggestions(content: str, title: str = "") -> List[Dict]:
    """
    Creates exactly 3 simple fallback image suggestions from content.
    Uses very simple, short prompts for better Pollinations.ai success rate.
    """
    # Extract key topics from content (simple extraction)
    words = content.lower().split()
    # Get meaningful words (length 4-10, not too common)
    common_words = {'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'}
    meaningful_words = [w for w in words if 4 <= len(w) <= 10 and w not in common_words][:5]
    
    suggestions = []
    
    # Create simple, short prompts
    if title:
        # Extract main topic from title (first 2-3 words)
        title_words = title.split()[:3]
        topic = ' '.join(title_words).lower()
        suggestions.append({
            "title": "Featured Image",
            "prompt": f"{topic}, digital art",
            "description": f"Featured image for {title}",
            "placement": "Header",
            "style": "modern"
        })
    
    # Create 2-3 additional simple suggestions to ensure we have exactly 3
    num_additional = max(2, 3 - len(suggestions))  # Ensure we have at least 3 total
    for i, word in enumerate(meaningful_words[:num_additional], 1):
        suggestions.append({
            "title": f"Content Image {i}",
            "prompt": f"{word}, illustration, digital art",
            "description": f"Image related to {word}",
            "placement": "Content",
            "style": "simple"
        })
    
    # Ensure we always return exactly 3 suggestions
    while len(suggestions) < 3:
        suggestions.append({
            "title": f"Blog Image {len(suggestions) + 1}",
            "prompt": "blog illustration, digital art",
            "description": "A relevant image for the blog post",
            "placement": "Content",
            "style": "modern"
        })
    
    return suggestions[:3]  # Return exactly 3

