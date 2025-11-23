import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { blogService } from '../services/blogService';

interface OutlineItem {
  id: string;
  title: string;
  children?: OutlineItem[];
}

interface SuggestionLog {
  id: string;
  message: string;
  timestamp: string;
}

// Unique ID generator to prevent duplicate keys
let logIdCounter = 0;
const generateUniqueLogId = (): string => {
  logIdCounter += 1;
  return `${Date.now()}-${logIdCounter}-${Math.random().toString(36).substr(2, 9)}`;
};

const BlogEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [suggestionLog, setSuggestionLog] = useState<SuggestionLog[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [sectionImprovement, setSectionImprovement] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [readTime, setReadTime] = useState(0);
  const [seoScore, setSeoScore] = useState(0);
  const [keywordDensity, setKeywordDensity] = useState(0);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [targetTone, setTargetTone] = useState('professional');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [imageSuggestions, setImageSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [outlineApproved, setOutlineApproved] = useState(false);
  const [pendingOutline, setPendingOutline] = useState<any>(null);
  const [pendingTitle, setPendingTitle] = useState<string>('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryData, setSummaryData] = useState<{summary: string; keywords: string[]} | null>(null);
  const [contentSections, setContentSections] = useState<string[]>([]);
  const [originalContent, setOriginalContent] = useState<string>(''); // Store original for comparison
  const contentTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Load user data and check if editing existing post
  useEffect(() => {
    const userData = localStorage.getItem('user');
    const onboardingData = localStorage.getItem('onboarding_step1');
    
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    if (onboardingData) {
      try {
        setOnboardingStep1(JSON.parse(onboardingData));
      } catch (e) {
        console.error('Error parsing onboarding data:', e);
      }
    }

    // Load existing blog post if editing
    if (id) {
      setIsEditMode(true);
      loadBlogPost(id);
    } else {
      // Check if topic was passed from navigation state
      const topicFromState = (location.state as any)?.topic;
      if (topicFromState) {
        setTopic(topicFromState);
        setTitle(topicFromState);
      }
      // Load suggested topics for new posts
      loadSuggestedTopics();
    }
  }, [id, location.state]);

  // Load blog post for editing
  const loadBlogPost = useCallback(async (postId: string) => {
    setIsLoading(true);
    try {
      const post = await blogService.getBlogPostById(postId);
      if (post) {
        setTitle(post.title || '');
        setContent(post.content || '');
        setTags(post.tags || []);
        setTopic(post.title || '');
        
        // Analyze existing content
        if (post.content && post.title) {
          const analysis = await blogService.analyzeContent(post.title, post.content);
          if (analysis.success) {
            setReadTime(analysis.read_time);
            setSeoScore(analysis.seo_score);
            setKeywordDensity(analysis.keyword_density);
          }
        }
      }
    } catch (error) {
      console.error('Error loading blog post:', error);
      setSuggestionLog(prev => [{
        id: generateUniqueLogId(),
        message: 'Failed to load blog post. Starting with empty editor.',
        timestamp: 'Just now'
      }, ...prev]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load suggested topics from backend
  const loadSuggestedTopics = useCallback(async () => {
    try {
      const result = await blogService.getTopicSuggestions('general', 5);
      // getTopicSuggestions returns TopicSuggestion[] (array)
      if (Array.isArray(result) && result.length > 0) {
        const topics = result.map((t: any) => t.title || t).filter(Boolean);
        setSuggestedTopics(topics);
      }
    } catch (error) {
      console.error('Error loading suggested topics:', error);
      // Set empty array on error
      setSuggestedTopics([]);
    }
  }, []);

  // Calculate read time and analyze content when content changes
  useEffect(() => {
    if (!content) {
      setReadTime(0);
      setSeoScore(0);
      setKeywordDensity(0);
      return;
    }

    // Calculate basic read time
    const words = content.split(/\s+/).filter(word => word.length > 0).length;
    const estimatedReadTime = Math.max(1, Math.ceil(words / 200));
    setReadTime(estimatedReadTime);
    
    // Analyze content when title and content are available (debounced)
    if (title && content && content.length > 100) {
      const timeoutId = setTimeout(() => {
        blogService.analyzeContent(title, content).then(result => {
          if (result.success) {
            setReadTime(result.read_time);
            setSeoScore(result.seo_score);
            setKeywordDensity(result.keyword_density);
          }
        }).catch(err => console.error('Error analyzing content:', err));
      }, 1000); // Debounce by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [content, title]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    navigate('/');
  }, [navigate]);

  const handleGenerateOutline = useCallback(async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setOutlineApproved(false);
    
    try {
      const result = await blogService.generateOutline(topic);
      if (result.success && result.outline) {
        setOutline(result.outline);
        
        // Store pending data from blog generation graph
        if (result.title) {
          setPendingTitle(result.title);
          setTitle(result.title); // Auto-populate title
        }
        if (result.tags && result.tags.length > 0) {
          setPendingTags(result.tags);
          setTags(result.tags); // Auto-populate tags
        }
        if (result.mindmap) {
          setPendingOutline(result.mindmap);
        }
        
        // Add engagement suggestions to log if available
        if (result.engagement_suggestions) {
          const insights = result.engagement_suggestions.insights || result.engagement_suggestions.improvements;
          if (insights) {
            setSuggestionLog(prev => [{
              id: generateUniqueLogId(),
              message: `Engagement insights: ${insights.substring(0, 100)}...`,
              timestamp: 'Just now'
            }, ...prev]);
          }
        }
        
        setSuggestionLog(prev => [{
          id: generateUniqueLogId(),
          message: `Outline generated for '${topic}'. Review and approve to generate full content.`,
          timestamp: 'Just now'
        }, ...prev]);
      }
    } catch (error) {
      console.error('Error generating outline:', error);
      setSuggestionLog(prev => [{
        id: generateUniqueLogId(),
        message: `Failed to generate outline: ${error}`,
        timestamp: 'Just now'
      }, ...prev]);
    } finally {
      setIsGenerating(false);
    }
  }, [topic]);

  const handleAddTag = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTag.trim() && !tags.includes(newTag.trim())) {
      setTags(prev => [...prev, newTag.trim()]);
      setNewTag('');
    }
  }, [newTag, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  }, []);

  const handleApproveAndGenerate = useCallback(async () => {
    if (!topic.trim() || !pendingOutline) {
      alert('Please generate an outline first.');
      return;
    }
    
    setIsGenerating(true);
    setOutlineApproved(true);
    
    try {
      const result = await blogService.generateContent(topic, pendingOutline, pendingTitle || title);
      if (result.success && result.content) {
        setContent(result.content);
        
        // Update title and tags if provided
        if (result.title) {
          setTitle(result.title);
        }
        if (result.tags && result.tags.length > 0) {
          setTags(result.tags);
        }
        
        // Add summary and keywords to suggestion log
        if (result.summary) {
          setSuggestionLog(prev => [{
            id: generateUniqueLogId(),
            message: `Blog generated successfully! Summary: ${result.summary.substring(0, 80)}...`,
            timestamp: 'Just now'
          }, ...prev]);
        } else {
          setSuggestionLog(prev => [{
            id: generateUniqueLogId(),
            message: 'Blog content generated successfully!',
            timestamp: 'Just now'
          }, ...prev]);
        }
        
        // Clear pending data
        setPendingOutline(null);
        setPendingTitle('');
        setPendingTags([]);
      }
    } catch (error) {
      console.error('Error generating content:', error);
      setSuggestionLog(prev => [{
        id: generateUniqueLogId(),
        message: `Failed to generate content: ${error}`,
        timestamp: 'Just now'
      }, ...prev]);
      setOutlineApproved(false);
    } finally {
      setIsGenerating(false);
    }
  }, [topic, pendingOutline, pendingTitle, title]);

  // Extract sections from content automatically
  useEffect(() => {
    if (content) {
      const sectionMatches = content.match(/^##\s+(.+)$/gm);
      if (sectionMatches) {
        const sections = sectionMatches.map(match => match.replace(/^##\s+/, '').trim());
        setContentSections(sections);
        // Auto-select first section if none selected
        if (!selectedSection && sections.length > 0) {
          setSelectedSection(sections[0]);
        }
      } else {
        // Fallback: use outline sections
        const outlineSections = outline.map(item => item.title);
        setContentSections(outlineSections);
      }
    }
  }, [content, outline]);

  const handleRegenerateSection = useCallback(async () => {
    if (!selectedSection || !sectionImprovement.trim()) return;
    setIsGenerating(true);
    
    try {
      const result = await blogService.regenerateSection(selectedSection, sectionImprovement, content);
      if (result.success && result.regenerated_section) {
        // Find and replace the section in content
        const sectionPatterns = [
          `## ${selectedSection}`,
          `### ${selectedSection}`,
          `# ${selectedSection}`
        ];
        
        let newContent = content;
        let sectionStart = -1;
        
        for (const pattern of sectionPatterns) {
          sectionStart = content.indexOf(pattern);
          if (sectionStart !== -1) {
            // Find the end of this section (next heading or end of content)
            const sectionContent = content.substring(sectionStart);
            const nextHeading = sectionContent.indexOf('\n##', pattern.length);
            const nextSubHeading = sectionContent.indexOf('\n###', pattern.length);
            
            let sectionEnd = content.length;
            if (nextHeading !== -1 && nextSubHeading !== -1) {
              sectionEnd = sectionStart + Math.min(nextHeading, nextSubHeading);
            } else if (nextHeading !== -1) {
              sectionEnd = sectionStart + nextHeading;
            } else if (nextSubHeading !== -1) {
              sectionEnd = sectionStart + nextSubHeading;
            }
            
            // Replace the section
            newContent = content.substring(0, sectionStart) + 
                        result.regenerated_section + 
                        content.substring(sectionEnd);
            break;
          }
        }
        
        setContent(newContent);
        setSuggestionLog(prev => [{
          id: generateUniqueLogId(),
          message: `Section "${selectedSection}" regenerated successfully`,
          timestamp: 'Just now'
        }, ...prev]);
        setSectionImprovement('');
      }
    } catch (error) {
      console.error('Error regenerating section:', error);
      setSuggestionLog(prev => [{
        id: generateUniqueLogId(),
        message: `Failed to regenerate section: ${error}`,
        timestamp: 'Just now'
      }, ...prev]);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSection, sectionImprovement, content]);

  const handleSaveDraft = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      alert('Please add a title and content before saving.');
      return;
    }

    try {
      // Extract first image from content or use first suggested image
      let featuredImage = '';
      const imageMatch = content.match(/!\[.*?\]\((.*?)\)/);
      if (imageMatch && imageMatch[1]) {
        featuredImage = imageMatch[1];
      } else if (imageSuggestions.length > 0 && imageSuggestions[0].url) {
        featuredImage = imageSuggestions[0].url;
      }

      const postData = {
        title,
        content,
        tags,
        status: 'draft' as const,
        excerpt: content.substring(0, 200),
        image_url: featuredImage || undefined,
      };

      if (isEditMode && id) {
        // Update existing post
        await blogService.updateBlogPost(id, postData);
        setSuggestionLog(prev => [{
          id: generateUniqueLogId(),
          message: 'Draft updated successfully',
          timestamp: 'Just now'
        }, ...prev]);
      } else {
        // Create new post
        await blogService.createBlogPost(postData);
        setSuggestionLog(prev => [{
          id: generateUniqueLogId(),
          message: 'Draft saved successfully',
          timestamp: 'Just now'
        }, ...prev]);
      }
      
      // Navigate to blog page after successful save
      setTimeout(() => {
        navigate('/blog');
      }, 500); // Small delay to show success message
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Failed to save draft. Please try again.');
    }
  }, [title, content, tags, isEditMode, id, imageSuggestions, navigate]);

  const handlePublish = useCallback(async () => {
    if (!title.trim() || !content.trim()) {
      alert('Please add a title and content before publishing.');
      return;
    }

    try {
      // Extract first image from content or use first suggested image
      let featuredImage = '';
      const imageMatch = content.match(/!\[.*?\]\((.*?)\)/);
      if (imageMatch && imageMatch[1]) {
        featuredImage = imageMatch[1];
      } else if (imageSuggestions.length > 0 && imageSuggestions[0].url) {
        featuredImage = imageSuggestions[0].url;
      }

      const postData = {
        title,
        content,
        tags,
        status: 'published' as const,
        excerpt: content.substring(0, 200),
        image_url: featuredImage || undefined,
      };

      if (isEditMode && id) {
        // Update existing post
        await blogService.updateBlogPost(id, postData);
      } else {
        // Create new post
        await blogService.createBlogPost(postData);
      }
      navigate('/blog');
    } catch (error) {
      console.error('Error publishing:', error);
      alert('Failed to publish. Please try again.');
    }
  }, [title, content, tags, navigate, isEditMode, id, imageSuggestions]);

  // Memoized sidebar content to prevent unnecessary re-renders
  const leftSidebarContent = useMemo(() => (
    <div className="flex flex-col gap-6">
      {/* AI Planning Assistant */}
      <div className="flex flex-col gap-4 flex-shrink-0">
        <h2 className="text-lg font-bold text-white">🧠 AI Planning Assistant</h2>
        <input
          type="text"
          placeholder="Enter a topic or keyword..."
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setOutlineApproved(false);
            setPendingOutline(null);
          }}
          className="h-12 px-4 bg-[#1a1a1a] border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#EB4747]/50 transition-colors"
        />
        <button
          onClick={handleGenerateOutline}
          disabled={!topic.trim() || isGenerating}
          className="h-10 bg-[#EB4747] text-white text-sm font-bold rounded-lg hover:bg-[#d10a14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating...' : 'Generate Outline'}
        </button>
        
        {suggestedTopics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestedTopics.map((suggestedTopic, index) => (
              <button
                key={`topic-${index}-${suggestedTopic.substring(0, 20)}`}
                onClick={() => setTopic(suggestedTopic)}
                className="px-3 py-1.5 bg-white/10 text-white text-xs font-medium rounded-full hover:bg-white/20 transition-colors"
              >
                {suggestedTopic}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Outline & Mind Map Viewer */}
      <div className="flex flex-col gap-3 sm:gap-4 flex-shrink-0 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-white">📋 AI Outline & Mind Map Viewer</h3>
          {outline.length > 0 && !outlineApproved && (
            <span className="text-[10px] sm:text-xs text-[#EB4747] font-semibold animate-pulse">Ready to Approve</span>
          )}
        </div>
        <div className="bg-[#121212] border border-white/10 rounded-lg p-3 sm:p-4 overflow-y-auto min-h-[150px] sm:min-h-[200px] max-h-[300px] sm:max-h-[350px] custom-scrollbar">
          <div className="space-y-2">
            {outline.length > 0 ? (
              outline.map((item) => (
                <div key={item.id} className="text-xs sm:text-sm text-gray-300">
                  <div className="py-1 font-medium text-white">{item.title}</div>
                  {item.children && item.children.length > 0 && (
                    <div className="pl-3 sm:pl-4 space-y-1 mt-1">
                      {item.children.map((child) => (
                        <div key={child.id} className="py-0.5 text-gray-400">
                          {child.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs sm:text-sm text-gray-500 text-center py-4">
                No outline generated yet. Enter a topic and click "Generate Outline" to get started.
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerateOutline}
            disabled={!topic.trim() || isGenerating}
            className="flex-1 h-8 sm:h-9 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Regenerate Outline'}
          </button>
          {outline.length > 0 && !outlineApproved && (
            <button
              onClick={handleApproveAndGenerate}
              disabled={isGenerating || !pendingOutline}
              className="flex-1 h-8 sm:h-9 bg-[#EB4747] text-white text-xs font-bold rounded-lg hover:bg-[#d10a14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Approve & Generate'}
            </button>
          )}
        </div>
      </div>

      {/* AI Suggestion Log */}
      <div className="flex flex-col gap-3 sm:gap-4 flex-shrink-0">
        <h3 className="text-sm sm:text-base font-bold text-white flex-shrink-0">AI Suggestion Log</h3>
        <div className="bg-[#1a1a1a] border border-white/20 rounded-lg p-2 sm:p-3 max-h-[150px] sm:max-h-[200px] overflow-y-auto custom-scrollbar">
          <div className="space-y-2 sm:space-y-3">
            {suggestionLog.map((log) => (
              <div key={log.id} className="relative bg-white/5 rounded-lg p-2 sm:p-3 pl-4 sm:pl-5 border-l-2 border-[#EB4747]">
                <p className="text-xs font-medium text-white mb-0.5 sm:mb-1 break-words">{log.message}</p>
                <p className="text-[10px] sm:text-xs text-gray-500">{log.timestamp}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ), [topic, isGenerating, suggestedTopics, outline, suggestionLog, handleGenerateOutline, outlineApproved, pendingOutline, handleApproveAndGenerate]);

  const rightSidebarContent = useMemo(() => (
    <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 h-full">
      <h2 className="text-base sm:text-lg font-bold text-white">🤖 AI Tools & Enhancements</h2>

      {/* Content Controls */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <h3 className="text-sm sm:text-base font-bold text-white">Content Controls</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <button 
            onClick={async () => {
              setIsGenerating(true);
              try {
                const result = await blogService.optimizeTitle(title, content);
                if (result && result.success && result.optimized_title) {
                  const newTitle = result.optimized_title.trim();
                  if (newTitle && newTitle !== title.trim()) {
                    setTitle(newTitle);
                    setSuggestionLog(prev => [{
                      id: generateUniqueLogId(),
                      message: `Title optimized: "${newTitle}"`,
                      timestamp: 'Just now'
                    }, ...prev]);
                  } else {
                    setSuggestionLog(prev => [{
                      id: generateUniqueLogId(),
                      message: 'Title optimization completed (no changes needed)',
                      timestamp: 'Just now'
                    }, ...prev]);
                  }
                } else {
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: 'Title optimization failed. Please try again.',
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error: any) {
                console.error('Error optimizing title:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Error: ${error.message || 'Failed to optimize title'}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !title.trim()}
            className="h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex flex-col items-center justify-center gap-0.5 sm:gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-center">Optimize Title</span>
            <span className="text-[#EB4747] text-[9px] sm:text-[10px]">(SEOAgent)</span>
          </button>
          <button 
            onClick={async () => {
              setIsGenerating(true);
              setOriginalContent(content); // Store original for comparison
              try {
                const result = await blogService.improveReadability(content, title);
                if (result.success && result.improved_content && result.improved_content !== content) {
                  setContent(result.improved_content);
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `Readability improved: Content simplified, sentences restructured, and flow enhanced`,
                    timestamp: 'Just now'
                  }, ...prev]);
                } else {
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: 'Readability improvement completed (content already optimized)',
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error) {
                console.error('Error improving readability:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Error improving readability: ${error}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !content.trim()}
            className="h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          >
            Improve Readability
          </button>
          <button 
            onClick={async () => {
              setIsGenerating(true);
              setOriginalContent(content); // Store original for comparison
              try {
                const result = await blogService.adjustTone(content, targetTone, title);
                if (result.success && result.adjusted_content && result.adjusted_content !== content) {
                  setContent(result.adjusted_content);
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `Tone adjusted to ${targetTone}: Content rewritten with ${targetTone} voice and style`,
                    timestamp: 'Just now'
                  }, ...prev]);
                } else {
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `Tone adjustment completed (content already matches ${targetTone} tone)`,
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error) {
                console.error('Error adjusting tone:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Error adjusting tone: ${error}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !content.trim()}
            className="h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          >
            Adjust Tone
          </button>
          <button 
            onClick={async () => {
              setIsGenerating(true);
              try {
                const result = await blogService.generateMeta(title, content);
                if (result.success) {
                  if (result.tags && result.tags.length > 0) {
                    setTags(prev => [...new Set([...prev, ...result.tags])]);
                  }
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: 'SEO meta tags generated',
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error) {
                console.error('Error generating meta:', error);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !title.trim() || !content.trim()}
            className="h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          >
            Generate Meta
          </button>
        </div>
      </div>

      {/* Content Intelligence */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <h3 className="text-sm sm:text-base font-bold text-white">Content Intelligence</h3>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="bg-[#1a1a1a] border border-[#EB4747]/30 rounded-lg p-1.5 sm:p-2 text-center">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Read Time</p>
            <p className="text-base sm:text-lg font-bold text-white">{readTime} min</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#EB4747]/30 rounded-lg p-1.5 sm:p-2 text-center">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">SEO Score</p>
            <p className="text-base sm:text-lg font-bold text-green-400">{seoScore}</p>
          </div>
          <div className="bg-[#1a1a1a] border border-[#EB4747]/30 rounded-lg p-1.5 sm:p-2 text-center">
            <p className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Keywords</p>
            <p className="text-base sm:text-lg font-bold text-white">{keywordDensity}%</p>
          </div>
        </div>
        <button 
          onClick={async () => {
            setIsGenerating(true);
            try {
              const result = await blogService.analyzeContent(title, content);
              if (result.success) {
                setReadTime(result.read_time);
                setSeoScore(result.seo_score);
                setKeywordDensity(result.keyword_density);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: 'Content analysis complete',
                  timestamp: 'Just now'
                }, ...prev]);
              }
            } catch (error) {
              console.error('Error analyzing content:', error);
            } finally {
              setIsGenerating(false);
            }
          }}
          disabled={isGenerating || !title.trim() || !content.trim()}
          className="w-full h-8 sm:h-9 bg-white/10 text-white text-[10px] sm:text-xs font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Run Full Analysis
        </button>
      </div>

      {/* Section Regeneration */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <h3 className="text-sm sm:text-base font-bold text-white">Section Regeneration</h3>
        <select
          value={selectedSection}
          onChange={(e) => setSelectedSection(e.target.value)}
          className="h-8 sm:h-9 bg-[#1a1a1a] border border-white/20 rounded-lg text-white text-xs sm:text-sm px-2 sm:px-3 focus:outline-none focus:border-[#EB4747]/50"
        >
          <option value="">Select Section to Regenerate</option>
          {contentSections.length > 0 ? (
            contentSections.map((section, idx) => (
              <option key={`section-${idx}-${section.substring(0, 30)}`} value={section}>{section}</option>
            ))
          ) : (
            outline.map((item) => (
              <option key={item.id} value={item.title}>{item.title}</option>
            ))
          )}
        </select>
        <select
          value={targetTone}
          onChange={(e) => setTargetTone(e.target.value)}
          className="h-8 sm:h-9 bg-[#1a1a1a] border border-white/20 rounded-lg text-white text-xs sm:text-sm px-2 sm:px-3 focus:outline-none focus:border-[#EB4747]/50"
        >
          <option value="professional">Professional</option>
          <option value="casual">Casual</option>
          <option value="friendly">Friendly</option>
          <option value="authoritative">Authoritative</option>
          <option value="conversational">Conversational</option>
        </select>
        <textarea
          value={sectionImprovement}
          onChange={(e) => setSectionImprovement(e.target.value)}
          placeholder="Describe what to improve..."
          className="h-16 sm:h-20 bg-[#1a1a1a] border border-white/20 rounded-lg text-white text-xs sm:text-sm px-2 sm:px-3 py-2 resize-none focus:outline-none focus:border-[#EB4747]/50 placeholder-gray-500"
        />
        <button
          onClick={handleRegenerateSection}
          disabled={!selectedSection || !sectionImprovement.trim() || isGenerating}
          className="w-full h-8 sm:h-9 bg-[#EB4747]/80 text-white text-[10px] sm:text-xs font-bold rounded-lg hover:bg-[#EB4747] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Regenerating...' : 'Regenerate Section'}
        </button>
      </div>

      {/* Translation & Summary */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <h3 className="text-sm sm:text-base font-bold text-white">Translation & Summary</h3>
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="h-8 sm:h-9 bg-[#1a1a1a] border border-white/20 rounded-lg text-white text-xs sm:text-sm px-2 sm:px-3 focus:outline-none focus:border-[#EB4747]/50"
        >
          <option value="en">English (en)</option>
          <option value="es">Spanish (es)</option>
          <option value="fr">French (fr)</option>
          <option value="de">German (de)</option>
          <option value="it">Italian (it)</option>
          <option value="pt">Portuguese (pt)</option>
          <option value="zh">Chinese (zh)</option>
          <option value="ja">Japanese (ja)</option>
          <option value="ko">Korean (ko)</option>
          <option value="ar">Arabic (ar)</option>
          <option value="ru">Russian (ru)</option>
          <option value="hi">Hindi (hi)</option>
        </select>
        <div className="flex gap-1.5 sm:gap-2">
          <button 
            onClick={async () => {
              if (!targetLanguage || targetLanguage === 'en') {
                alert('Please select a target language other than English');
                return;
              }
              if (!content.trim()) {
                alert('Please add some content to translate');
                return;
              }
              setIsGenerating(true);
              try {
                const result = await blogService.translateContent(content, targetLanguage, 'en', title);
                if (result && result.success) {
                  // Update content
                  if (result.translated_content) {
                    setContent(result.translated_content);
                  }
                  // Update title if translated
                  if (result.translated_title && result.translated_title.trim() && result.translated_title !== title.trim()) {
                    setTitle(result.translated_title);
                  }
                  
                  const langName = result.target_language || targetLanguage;
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `Content and title translated to ${langName}`,
                    timestamp: 'Just now'
                  }, ...prev]);
                } else {
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: 'Translation failed. Please try again.',
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error: any) {
                console.error('Error translating:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Translation error: ${error.message || 'Failed to translate'}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !content.trim()}
            className="flex-1 h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex flex-col items-center justify-center gap-0.5 sm:gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            <span>Translate</span>
          </button>
          <button 
            onClick={async () => {
              setIsGenerating(true);
              try {
                const result = await blogService.summarizeContent(title, content);
                if (result.success) {
                  setSummaryData({
                    summary: result.summary || '',
                    keywords: result.keywords || []
                  });
                  setShowSummaryModal(true);
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: 'Summary generated successfully',
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error) {
                console.error('Error summarizing:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Error generating summary: ${error}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !content.trim()}
            className="flex-1 h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex flex-col items-center justify-center gap-0.5 sm:gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Summary</span>
          </button>
          <button 
            onClick={async () => {
              setIsGenerating(true);
              try {
                const result = await blogService.suggestImages(content, title);
                if (result.success) {
                  const images = result.images || result.suggestions || [];
                  setImageSuggestions(images);
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `${images.length} image suggestion${images.length !== 1 ? 's' : ''} generated${images.length > 0 ? '. Check suggestions below.' : '.'}`,
                    timestamp: 'Just now'
                  }, ...prev]);
                } else {
                  setSuggestionLog(prev => [{
                    id: generateUniqueLogId(),
                    message: `Image suggestion failed: ${result.error || 'Unknown error'}`,
                    timestamp: 'Just now'
                  }, ...prev]);
                }
              } catch (error) {
                console.error('Error suggesting images:', error);
                setSuggestionLog(prev => [{
                  id: generateUniqueLogId(),
                  message: `Error generating image suggestions: ${error}`,
                  timestamp: 'Just now'
                }, ...prev]);
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !content.trim()}
            className="flex-1 h-14 sm:h-16 bg-white/5 text-white text-[10px] sm:text-xs rounded-lg hover:bg-white/10 transition-colors flex flex-col items-center justify-center gap-0.5 sm:gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Images</span>
          </button>
        </div>
        
        {/* Image Suggestions Display */}
        {imageSuggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs sm:text-sm font-semibold text-white">Image Suggestions</h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
              {imageSuggestions.map((img, idx) => (
                <div key={img.url ? `img-${idx}-${img.url.substring(0, 30)}` : `img-${idx}-${img.title || idx}`} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-2">
                  {img.url && (
                    <img 
                      src={img.url} 
                      alt={img.title || `Image ${idx + 1}`}
                      className="w-full h-24 object-cover rounded mb-2"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Image+Not+Available';
                      }}
                    />
                  )}
                  <p className="text-xs text-white font-medium mb-1">{img.title || img.suggestion_title || `Image ${idx + 1}`}</p>
                  {img.description && (
                    <p className="text-[10px] text-gray-400 line-clamp-2 mb-2">{img.description}</p>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        if (img.url) {
                          // Insert image markdown at cursor position or at end
                          const imageMarkdown = `\n\n![${img.title || 'Image'}](${img.url})\n\n`;
                          const textarea = contentTextareaRef.current || document.querySelector('textarea[name="content"]') as HTMLTextAreaElement || document.querySelector('textarea') as HTMLTextAreaElement;
                          if (textarea) {
                            const start = textarea.selectionStart ?? content.length;
                            const end = textarea.selectionEnd ?? content.length;
                            const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);
                            setContent(newContent);
                            setSuggestionLog(prev => [{
                              id: generateUniqueLogId(),
                              message: `Image "${img.title || `Image ${idx + 1}`}" inserted into content`,
                              timestamp: 'Just now'
                            }, ...prev]);
                            // Set cursor position after inserted image
                            setTimeout(() => {
                              textarea.focus();
                              const newPos = start + imageMarkdown.length;
                              textarea.setSelectionRange(newPos, newPos);
                            }, 0);
                          } else {
                            // Fallback: append to end of content
                            setContent(prev => prev + imageMarkdown);
                            setSuggestionLog(prev => [{
                              id: generateUniqueLogId(),
                              message: `Image "${img.title || `Image ${idx + 1}`}" inserted at end of content`,
                              timestamp: 'Just now'
                            }, ...prev]);
                          }
                        }
                      }}
                      className="flex-1 px-2 py-1 bg-[#EB4747]/20 text-[#EB4747] text-[10px] font-semibold rounded hover:bg-[#EB4747]/30 transition-colors"
                    >
                      Insert
                    </button>
                    {idx === 0 && (
                      <button
                        onClick={() => {
                          // Set as featured image (will be saved with blog post)
                          setSuggestionLog(prev => [{
                            id: generateUniqueLogId(),
                            message: `Image "${img.title || 'Image 1'}" set as featured image`,
                            timestamp: 'Just now'
                          }, ...prev]);
                        }}
                        className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded hover:bg-green-500/30 transition-colors"
                        title="This will be saved as the blog's featured image"
                      >
                        Featured
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  ), [selectedSection, sectionImprovement, isGenerating, outline, readTime, seoScore, keywordDensity, handleRegenerateSection, title, content, targetTone, targetLanguage, contentSections, imageSuggestions]);

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(235, 71, 71, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(235, 71, 71, 0.7);
        }
      `}</style>
      {/* Header - Same as Dashboard */}
      <header className="w-full h-[73px] sm:h-[80px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 md:px-10 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/dashboard">
              <img src={logoIcon} alt="FluxWell" className="w-7 h-7 sm:w-8 sm:h-8" />
            </Link>
            <Link to="/dashboard">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold font-['Lexend'] tracking-tight">
                <span className="text-white">Flux</span>
                <span className="text-[#EB4747]">Well</span>
              </h2>
            </Link>
          </div>
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-sm">
            <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
            <Link to="/workouts" className="text-gray-400 hover:text-white transition-colors">Workouts</Link>
            <Link to="/nutrition" className="text-gray-400 hover:text-white transition-colors">Nutrition</Link>
            <Link to="/realtime" className="text-gray-400 hover:text-white transition-colors">Tracking</Link>
            <Link to="/coach" className="text-gray-400 hover:text-white transition-colors">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white transition-colors">Progress</Link>
            <Link to="/blog" className="text-[#EB4747] font-semibold">Blog</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={handleLogout} 
              className="hidden sm:inline px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10 transition-colors"
            >
              Logout
            </button>
            <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {(() => {
                const provider = user?.auth_provider;
                const socialPic = (provider === 'google' || provider === 'fitbit') ? (user?.profile_picture_url || null) : null;
                const formPic = provider === 'form' ? (onboardingStep1?.profile_picture_url || null) : null;
                const src = socialPic || formPic;
                if (src) return <img src={src} alt={user?.full_name || 'Profile'} className="w-full h-full object-cover" />;
                return <span className="text-xs sm:text-sm font-semibold">{user?.full_name?.[0] || 'U'}</span>;
              })()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-[85px] sm:pt-[93px] md:pt-[103px] pb-6 px-3 sm:px-4 md:px-6 lg:px-10 min-h-screen">
        <div className="max-w-[1920px] mx-auto">
          {/* Page Title */}
          <div className="mb-4 sm:mb-6 mt-4 sm:mt-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white">
              {isEditMode ? 'Edit Blog Post' : 'AI Blog Creation & Editor'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 sm:mt-2">
              {isEditMode ? 'Edit your blog post with AI assistance' : 'Create and edit your blog posts with AI assistance'}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[#EB4747] border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-400">Loading blog post...</span>
            </div>
          )}

          {/* Main Layout */}
          {!isLoading && (
          <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 md:gap-6">
            {/* Left Sidebar - AI Planning Assistant */}
            <aside className={`${showLeftSidebar ? 'translate-x-0' : '-translate-x-full'} fixed lg:relative lg:translate-x-0 top-[85px] sm:top-[93px] md:top-[103px] lg:top-auto left-0 z-50 lg:z-auto w-[280px] sm:w-[320px] lg:w-[300px] xl:w-[340px] h-[calc(100vh-85px)] sm:h-[calc(100vh-93px)] md:h-[calc(100vh-103px)] lg:h-[calc(100vh-120px)] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 sm:p-4 md:p-5 overflow-hidden transition-transform duration-300 lg:flex-shrink-0 flex flex-col`}>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {leftSidebarContent}
              </div>
              {/* Close button for mobile */}
              <button
                onClick={() => setShowLeftSidebar(false)}
                className="lg:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </aside>

            {/* Mobile Sidebar Overlay */}
            {showLeftSidebar && (
              <div 
                className="fixed inset-0 bg-black/80 z-40 lg:hidden"
                onClick={() => setShowLeftSidebar(false)}
              />
            )}

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden">
              {/* Editor Header */}
              <div className="border-b border-white/10 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex-shrink-0">
                <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="flex-1 text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white bg-transparent border-none outline-none placeholder-gray-500"
                      placeholder="Enter blog title..."
                    />
                    {isGenerating && (
                      <div className="w-5 h-5 border-2 border-[#EB4747] border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <button 
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          const result = await blogService.optimizeTitle(title, content);
                          if (result && result.success && result.optimized_title) {
                            const newTitle = result.optimized_title.trim();
                            if (newTitle && newTitle !== title.trim()) {
                              setTitle(newTitle);
                              setSuggestionLog(prev => [{
                                id: generateUniqueLogId(),
                                message: `Title refined: "${newTitle}"`,
                                timestamp: 'Just now'
                              }, ...prev]);
                            } else {
                              setSuggestionLog(prev => [{
                                id: generateUniqueLogId(),
                                message: 'Title refinement completed (no changes needed)',
                                timestamp: 'Just now'
                              }, ...prev]);
                            }
                          } else {
                            setSuggestionLog(prev => [{
                              id: generateUniqueLogId(),
                              message: 'Title refinement failed. Please try again.',
                              timestamp: 'Just now'
                            }, ...prev]);
                          }
                        } catch (error: any) {
                          console.error('Error refining title:', error);
                          setSuggestionLog(prev => [{
                            id: generateUniqueLogId(),
                            message: `Error: ${error.message || 'Failed to refine title'}`,
                            timestamp: 'Just now'
                          }, ...prev]);
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isGenerating || !title.trim()}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGenerating ? 'Refining...' : 'Refine'}
                    </button>
                    <button
                      onClick={handleSaveDraft}
                      disabled={isGenerating || !title.trim() || !content.trim()}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save Draft
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={isGenerating || !title.trim() || !content.trim()}
                      className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-[#EB4747] text-white text-xs font-bold rounded-lg hover:bg-[#d10a14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Publish
                    </button>
                  </div>
                </div>
              </div>

              {/* Red Divider */}
              <div className="h-0.5 bg-[#EB4747] shadow-[0_0_10px_#EB4747]" />

              {/* Editor Content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 min-h-[300px] sm:min-h-[400px]">
                <textarea
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full min-h-[300px] sm:min-h-[400px] bg-transparent text-xs sm:text-sm md:text-base text-gray-300 leading-relaxed resize-none border-none outline-none placeholder-gray-500"
                  placeholder="Start writing your blog post..."
                />
              </div>

              {/* Tags Section */}
              <div className="border-t border-white/10 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex items-center gap-2 flex-wrap flex-shrink-0">
                <span className="text-sm text-gray-400 font-medium">Tags:</span>
                <div className="flex flex-wrap gap-2 flex-1">
                  {tags.map((tag, index) => (
                    <span
                      key={`tag-${index}-${tag}`}
                      className="px-3 py-1 bg-[#EB4747]/20 text-white text-xs font-medium rounded-full flex items-center gap-2"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400 transition-colors text-base leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Add tags..."
                    className="flex-1 min-w-[100px] bg-transparent text-sm text-gray-400 border-none outline-none placeholder-gray-500"
                  />
                </div>
              </div>
            </div>

            {/* Right Sidebar - AI Tools */}
            <aside className={`${showRightSidebar ? 'translate-x-0' : 'translate-x-full'} fixed xl:relative xl:translate-x-0 top-[85px] sm:top-[93px] md:top-[103px] xl:top-auto right-0 z-50 xl:z-auto w-[280px] sm:w-[320px] xl:w-[320px] h-[calc(100vh-85px)] sm:h-[calc(100vh-93px)] md:h-[calc(100vh-103px)] xl:h-[calc(100vh-120px)] bg-[#1a1a1a] border border-white/10 rounded-xl p-3 sm:p-4 md:p-5 overflow-y-auto custom-scrollbar transition-transform duration-300 xl:flex-shrink-0 flex flex-col`}>
              {rightSidebarContent}
              {/* Close button for mobile */}
              <button
                onClick={() => setShowRightSidebar(false)}
                className="xl:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </aside>

            {/* Mobile Sidebar Overlay for Right */}
            {showRightSidebar && (
              <div 
                className="fixed inset-0 bg-black/80 z-40 xl:hidden"
                onClick={() => setShowRightSidebar(false)}
              />
            )}
          </div>
          )}
        </div>
      </main>

      {/* Summary Modal */}
      {showSummaryModal && summaryData && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowSummaryModal(false)}>
          <div className="bg-[#1a1a1a] border border-white/20 rounded-xl p-4 sm:p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Blog Summary</h2>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Summary</h3>
                <p className="text-white text-sm sm:text-base leading-relaxed whitespace-pre-wrap">{summaryData.summary}</p>
              </div>
              {summaryData.keywords && summaryData.keywords.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {summaryData.keywords.map((keyword, idx) => (
                      <span key={`keyword-${idx}-${keyword}`} className="px-3 py-1 bg-[#EB4747]/20 text-[#EB4747] text-xs rounded-full border border-[#EB4747]/30">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowSummaryModal(false)}
              className="mt-6 w-full py-2 bg-[#EB4747] text-white text-sm font-bold rounded-lg hover:bg-[#d10a14] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Buttons for Mobile */}
      <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 sm:gap-3 lg:hidden">
        <button 
          className="w-12 h-12 sm:w-14 sm:h-14 bg-[#EB4747] rounded-full shadow-lg hover:bg-[#d10a14] transition-colors flex items-center justify-center"
          onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          aria-label="Toggle AI Planning"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>
        <button 
          className="w-12 h-12 sm:w-14 sm:h-14 bg-[#EB4747] rounded-full shadow-lg hover:bg-[#d10a14] transition-colors flex items-center justify-center"
          onClick={() => setShowRightSidebar(!showRightSidebar)}
          aria-label="Toggle AI Tools"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default BlogEditorPage;
