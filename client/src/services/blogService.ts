import { API_ENDPOINTS } from '../config/api';

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content?: string;
  status: 'published' | 'draft';
  views: number;
  likes: number;
  comments: number;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  read_time?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  user_id?: string;
  author_name?: string;
  author_image?: string;
  author_email?: string;
}

export interface BlogFilters {
  category?: string;
  search?: string;
  status?: 'draft' | 'published';
  sortBy?: 'Latest' | 'Popular' | 'Trending' | 'Oldest';
  page?: number;
  limit?: number;
}

export interface BlogResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface AnalyticsMetrics {
  total_blogs: number;
  total_views: number;
  total_comments: number;
  total_likes: number;
  avg_read_time: string;
  engagement_rate: string;
  views_over_time: Array<{ date: string; views: number }>;
  engagement_by_week: Array<{ week: string; engagement: number; raw_engagement?: number }>;
  top_categories: Array<{
    name: string;
    value: number;
    color: string;
    count?: number;
    views?: number;
    engagement?: number;
  }>;
}

export interface TopicSuggestion {
  title: string;
  reason: string;
  trending: boolean;
  category: string;
}

export interface AIInsights {
  insights: string;
  suggested_tags: string[];
  improvements: string;
  suggested_topics: TopicSuggestion[];
  analytics?: {
    total_blogs: number;
    total_views: number;
    engagement_rate: string;
  };
}

class BlogService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  /**
   * Fetch all published blog posts from all users (public endpoint, no auth required)
   */
  async getPublicBlogPosts(filters?: BlogFilters): Promise<BlogResponse> {
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(
          `${API_ENDPOINTS.BLOG.PUBLIC_POSTS}?${params.toString()}`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          if (response.status === 401) {
            // Clear token if unauthorized
            localStorage.removeItem('access_token');
            throw new Error('Unauthorized');
          }
          if (response.status === 500) {
            // Return empty data for server errors
            return {
              posts: [],
              total: 0,
              page: filters?.page || 1,
              limit: filters?.limit || 20,
              total_pages: 0,
            };
          }
          const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch public blog posts' }));
          throw new Error(errorData.detail || 'Failed to fetch public blog posts');
        }
        
        const data = await response.json();
        return {
          posts: data.posts || [],
          total: data.total || 0,
          page: data.page || 1,
          limit: data.limit || 20,
          total_pages: data.total_pages || 0,
        };
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Request timeout while fetching public blog posts');
          return {
            posts: [],
            total: 0,
            page: filters?.page || 1,
            limit: filters?.limit || 20,
            total_pages: 0,
          };
        }
        if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
          console.error('Network error while fetching public blog posts:', fetchError);
          return {
            posts: [],
            total: 0,
            page: filters?.page || 1,
            limit: filters?.limit || 20,
            total_pages: 0,
          };
        }
        throw fetchError;
      }
    } catch (error) {
      console.error('Error fetching public blog posts:', error);
      return {
        posts: [],
        total: 0,
        page: filters?.page || 1,
        limit: filters?.limit || 20,
        total_pages: 0,
      };
    }
  }

  /**
   * Fetch all blog posts with optional filters
   */
  async getBlogPosts(filters?: BlogFilters): Promise<BlogResponse> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch(
          `${API_ENDPOINTS.BLOG.POSTS}?${params.toString()}`,
          {
            headers: this.getAuthHeaders(),
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
        // Handle different error status codes
        if (response.status === 401) {
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem('access_token');
          throw new Error('Authentication failed. Please login again.');
        } else if (response.status === 500) {
          // Server error - return empty data instead of crashing
          console.error('Server error fetching blog posts');
          return {
            posts: [],
            total: 0,
            page: filters?.page || 1,
            limit: filters?.limit || 10,
            total_pages: 0
          };
        }
        throw new Error(`Failed to fetch blog posts: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      // Handle network errors gracefully
      if (error.name === 'AbortError' || error.name === 'TypeError' || error.message?.includes('Failed to fetch')) {
        console.error('Network error fetching blog posts:', error);
        // Return empty data instead of throwing
        return {
          posts: [],
          total: 0,
          page: filters?.page || 1,
          limit: filters?.limit || 10,
          total_pages: 0
        };
      }
      console.error('Error fetching blog posts:', error);
      throw error;
    }
  }

  /**
   * Fetch a single blog post by ID
   */
  async getBlogPostById(id: string): Promise<BlogPost | null> {
    try {
      const response = await fetch(
        API_ENDPOINTS.BLOG.POST(id),
        {
          headers: this.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch blog post');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching blog post:', error);
      return null;
    }
  }

  /**
   * Get blog analytics
   */
  async getAnalytics(): Promise<AnalyticsMetrics> {
    try {
      const response = await fetch(
        API_ENDPOINTS.BLOG.ANALYTICS,
        {
          headers: this.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  /**
   * Get AI insights and suggestions
   */
  async getAIInsights(category?: string): Promise<AIInsights> {
    try {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      
      const response = await fetch(
        `${API_ENDPOINTS.BLOG.INSIGHTS}?${params.toString()}`,
        {
          headers: this.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch AI insights');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      throw error;
    }
  }

  /**
   * Get topic suggestions
   */
  async getTopicSuggestions(category: string = 'general', count: number = 5): Promise<TopicSuggestion[]> {
    try {
      const params = new URLSearchParams();
      params.append('category', category);
      params.append('count', count.toString());
      
      const response = await fetch(
        `${API_ENDPOINTS.BLOG.TOPIC_SUGGESTIONS}?${params.toString()}`,
        {
          headers: this.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch topic suggestions');
      }
      
      const data = await response.json();
      return data.suggested_topics || [];
    } catch (error) {
      console.error('Error fetching topic suggestions:', error);
      return [];
    }
  }

  /**
   * Create a new blog post
   */
  async createBlogPost(post: Partial<BlogPost>): Promise<BlogPost> {
    try {
      const response = await fetch(
        API_ENDPOINTS.BLOG.POSTS,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(post),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to create blog post');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating blog post:', error);
      throw error;
    }
  }

  /**
   * Update a blog post
   */
  async updateBlogPost(id: string, post: Partial<BlogPost>): Promise<BlogPost> {
    try {
      const response = await fetch(
        API_ENDPOINTS.BLOG.POST(id),
        {
          method: 'PUT',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(post),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to update blog post');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating blog post:', error);
      throw error;
    }
  }

  /**
   * Delete a blog post
   */
  async deleteBlogPost(id: string): Promise<void> {
    try {
      const response = await fetch(
        API_ENDPOINTS.BLOG.POST(id),
        {
          method: 'DELETE',
          headers: this.getAuthHeaders(),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to delete blog post' }));
        throw new Error(errorData.detail || 'Failed to delete blog post');
      }
    } catch (error) {
      console.error('Error deleting blog post:', error);
      throw error;
    }
  }

  // ==================== Blog Editor Methods ====================

  /**
   * Generate blog outline from topic
   */
  async generateOutline(topic: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.GENERATE_OUTLINE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ topic }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate outline');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating outline:', error);
      throw error;
    }
  }

  /**
   * Generate blog content (after outline approval)
   */
  async generateContent(topic: string, outline?: any, title?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.GENERATE_CONTENT, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ 
          topic, 
          outline: outline || null,
          title: title || null,
          approved: true 
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate content');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating content:', error);
      throw error;
    }
  }

  /**
   * Optimize blog title
   */
  async optimizeTitle(title: string, content?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.OPTIMIZE_TITLE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title, content }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to optimize title');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error optimizing title:', error);
      throw error;
    }
  }

  /**
   * Improve content readability
   */
  async improveReadability(content: string, title?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.IMPROVE_READABILITY, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ content, title }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to improve readability');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error improving readability:', error);
      throw error;
    }
  }

  /**
   * Adjust content tone
   */
  async adjustTone(content: string, targetTone: string, title?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.ADJUST_TONE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ content, target_tone: targetTone, title }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to adjust tone');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error adjusting tone:', error);
      throw error;
    }
  }

  /**
   * Generate SEO meta tags
   */
  async generateMeta(title: string, content: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.GENERATE_META, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title, content }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate meta');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error generating meta:', error);
      throw error;
    }
  }

  /**
   * Translate content
   */
  async translateContent(content: string, targetLanguage: string, sourceLanguage: string = 'en', title?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.TRANSLATE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ 
          content, 
          title: title || undefined,
          target_language: targetLanguage, 
          source_language: sourceLanguage 
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to translate content');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error translating content:', error);
      throw error;
    }
  }

  /**
   * Summarize content (public endpoint, no auth required)
   */
  async summarizePublicBlog(title: string, content: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.PUBLIC_SUMMARIZE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, content }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to summarize blog' }));
        throw new Error(errorData.detail || 'Failed to summarize blog');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error summarizing public blog:', error);
      throw error;
    }
  }

  /**
   * Summarize content
   */
  async summarizeContent(title: string, content: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.SUMMARIZE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title, content }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to summarize content');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error summarizing content:', error);
      throw error;
    }
  }

  /**
   * Suggest images for blog
   */
  async suggestImages(content: string, title?: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.SUGGEST_IMAGES, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ content, title }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to suggest images');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error suggesting images:', error);
      throw error;
    }
  }

  /**
   * Regenerate section
   */
  async regenerateSection(sectionTitle: string, improvementDescription: string, fullContent: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.REGENERATE_SECTION, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ section_title: sectionTitle, improvement_description: improvementDescription, full_content: fullContent }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to regenerate section');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error regenerating section:', error);
      throw error;
    }
  }

  /**
   * Analyze content
   */
  async analyzeContent(title: string, content: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.EDITOR.ANALYZE, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title, content }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to analyze content');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error analyzing content:', error);
      throw error;
    }
  }

  /**
   * Get a public blog post by ID (no auth required)
   * @param incrementViews - Whether to increment the view count (default: true)
   */
  async getPublicBlogPostById(id: string, incrementViews: boolean = true): Promise<BlogPost | null> {
    try {
      const url = `${API_ENDPOINTS.BLOG.PUBLIC_POST(id)}?increment_views=${incrementViews}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch blog post');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching public blog post:', error);
      throw error;
    }
  }

  /**
   * Like or unlike a blog post (requires authentication)
   */
  async toggleLike(postId: string): Promise<{ liked: boolean; total_likes: number; success: boolean }> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.LIKE(postId), {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to like posts');
        }
        const errorData = await response.json().catch(() => ({ detail: 'Failed to toggle like' }));
        throw new Error(errorData.detail || 'Failed to toggle like');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  }

  /**
   * Check if current user has liked a post (requires authentication)
   */
  async getLikeStatus(postId: string): Promise<{ liked: boolean; success: boolean }> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.LIKE_STATUS(postId), {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        return { liked: false, success: false };
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting like status:', error);
      return { liked: false, success: false };
    }
  }

  /**
   * Add a comment to a blog post (requires authentication)
   */
  async addComment(postId: string, content: string): Promise<any> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.COMMENTS(postId), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to comment');
        }
        const errorData = await response.json().catch(() => ({ detail: 'Failed to add comment' }));
        throw new Error(errorData.detail || 'Failed to add comment');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a blog post (public endpoint)
   */
  async getComments(postId: string): Promise<any[]> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.COMMENTS(postId), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  }

  /**
   * Delete a comment (requires authentication)
   */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.COMMENT(postId, commentId), {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to delete comment' }));
        throw new Error(errorData.detail || 'Failed to delete comment');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  /**
   * Get related blogs and AI suggestions (public endpoint)
   */
  async getRelatedBlogs(postId: string): Promise<{
    related_blogs: BlogPost[];
    suggested_topics: TopicSuggestion[];
    insights: string;
    success: boolean;
  }> {
    try {
      const response = await fetch(API_ENDPOINTS.BLOG.RELATED(postId), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return {
          related_blogs: [],
          suggested_topics: [],
          insights: '',
          success: false,
        };
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching related blogs:', error);
      return {
        related_blogs: [],
        suggested_topics: [],
        insights: '',
        success: false,
      };
    }
  }
}

export const blogService = new BlogService();
