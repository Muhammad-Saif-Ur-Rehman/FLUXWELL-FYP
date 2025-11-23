import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { blogService, BlogPost } from '../services/blogService';
import Header from '../components/ui/Header';
import { API_ENDPOINTS } from '../config/api';

// Markdown Content Renderer Component - Optimized for performance with comprehensive markdown support
const MarkdownContent: React.FC<{ content: string }> = memo(({ content }) => {
  const renderContent = useMemo(() => {
    if (!content) return [];

    // Split content into blocks (paragraphs, headings, lists, tables, code, etc.)
    const blocks: Array<{ type: string; content: string; level?: number; language?: string; headers?: string[]; rows?: string[][] }> = [];
    const lines = content.split('\n');
    let currentBlock = '';
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;
    let listItems: string[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeLines: string[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    let inBlockquote = false;
    let blockquoteLines: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        blocks.push({ type: listType === 'ol' ? 'ordered-list' : 'unordered-list', content: listItems.join('\n') });
        listItems = [];
      }
      inList = false;
      listType = null;
    };

    const flushParagraph = () => {
      if (currentBlock.trim()) {
        blocks.push({ type: 'paragraph', content: currentBlock.trim() });
        currentBlock = '';
      }
    };

    const flushCodeBlock = () => {
      if (codeLines.length > 0) {
        blocks.push({ type: 'code', content: codeLines.join('\n'), language: codeLanguage || 'text' });
        codeLines = [];
        codeLanguage = '';
      }
      inCodeBlock = false;
    };

    const flushTable = () => {
      if (tableHeaders.length > 0 || tableRows.length > 0) {
        blocks.push({ type: 'table', content: '', headers: tableHeaders, rows: tableRows });
        tableHeaders = [];
        tableRows = [];
      }
      inTable = false;
    };

    const flushBlockquote = () => {
      if (blockquoteLines.length > 0) {
        blocks.push({ type: 'blockquote', content: blockquoteLines.join('\n') });
        blockquoteLines = [];
      }
      inBlockquote = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code blocks
      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          flushList();
          flushParagraph();
          flushTable();
          flushBlockquote();
          inCodeBlock = true;
          codeLanguage = trimmed.substring(3).trim();
        } else {
          flushCodeBlock();
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Empty line
      if (!trimmed) {
        flushList();
        flushParagraph();
        flushTable();
        flushBlockquote();
        continue;
      }

      // Horizontal rule
      if (trimmed.match(/^[-*_]{3,}$/)) {
        flushList();
        flushParagraph();
        flushTable();
        flushBlockquote();
        blocks.push({ type: 'hr', content: '' });
        continue;
      }

      // Headings
      if (trimmed.match(/^#{1,6}\s/)) {
        flushList();
        flushParagraph();
        flushTable();
        flushBlockquote();
        const level = trimmed.match(/^#+/)?.[0].length || 2;
        const content = trimmed.replace(/^#+\s/, '');
        blocks.push({ type: 'heading', content, level });
        continue;
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        if (!inBlockquote) {
          flushList();
          flushParagraph();
          flushTable();
          inBlockquote = true;
        }
        blockquoteLines.push(trimmed.substring(2));
        continue;
      } else {
        flushBlockquote();
      }

      // Tables
      if (trimmed.includes('|')) {
        const cells = trimmed.split('|').map(cell => cell.trim()).filter(cell => cell);
        if (cells.length > 0) {
          if (!inTable) {
            flushList();
            flushParagraph();
            inTable = true;
            tableHeaders = cells;
            continue;
          }
          // Skip separator row (e.g., |---|---|
          if (cells.every(cell => cell.match(/^[-:]+$/))) {
            continue;
          }
          tableRows.push(cells);
          continue;
        }
      } else {
        flushTable();
      }

      // Lists
      if (trimmed.match(/^\d+\.\s/)) {
        if (!inList || listType !== 'ol') {
          flushList();
          flushParagraph();
          inList = true;
          listType = 'ol';
        }
        listItems.push(trimmed.replace(/^\d+\.\s/, ''));
        continue;
      } else if (trimmed.match(/^[-*+]\s/)) {
        if (!inList || listType !== 'ul') {
          flushList();
          flushParagraph();
          inList = true;
          listType = 'ul';
        }
        listItems.push(trimmed.replace(/^[-*+]\s/, ''));
        continue;
      } else {
        flushList();
      }

      // Images
      if (trimmed.startsWith('![')) {
        flushParagraph();
        const match = trimmed.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          blocks.push({ type: 'image', content: match[2], level: 0 });
          continue;
        }
      }

      // Regular text
      currentBlock += (currentBlock ? '\n' : '') + line;
    }

    flushList();
    flushParagraph();
    flushCodeBlock();
    flushTable();
    flushBlockquote();

    return blocks;
  }, [content]);

  const formatInlineMarkdown = (text: string): React.ReactNode => {
    if (!text) return text;

    const elements: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    // Process inline code first `code`
    const codeRegex = /`([^`]+)`/g;
    const codeMatches: Array<{ start: number; end: number; content: string }> = [];
    let match;
    while ((match = codeRegex.exec(text)) !== null) {
      codeMatches.push({ start: match.index, end: match.index + match[0].length, content: match[1] });
    }

    // Process links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const linkMatches: Array<{ start: number; end: number; text: string; url: string }> = [];
    while ((match = linkRegex.exec(text)) !== null) {
      // Check if this link is inside code
      const insideCode = codeMatches.some(code => match!.index >= code.start && match!.index < code.end);
      if (!insideCode) {
        linkMatches.push({ start: match.index, end: match.index + match[0].length, text: match[1], url: match[2] });
      }
    }

    // Combine and sort all special matches
    const allMatches = [
      ...codeMatches.map(m => ({ ...m, type: 'code' as const })),
      ...linkMatches.map(m => ({ ...m, type: 'link' as const }))
    ].sort((a, b) => a.start - b.start);

    let lastIndex = 0;
    for (const m of allMatches) {
      // Add text before this match
      if (m.start > lastIndex) {
        const beforeText = text.substring(lastIndex, m.start);
        elements.push(...formatBasicInlineMarkdown(beforeText, key++));
      }

      // Add the special element
      if (m.type === 'code') {
        elements.push(
          <code key={key++} className="px-2 py-1 bg-white/10 border border-white/20 text-[#EB4747] text-sm rounded font-mono">
            {m.content}
          </code>
        );
      } else if (m.type === 'link') {
        elements.push(
          <a key={key++} href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#EB4747] hover:text-[#ff5757] underline transition-colors">
            {m.text}
          </a>
        );
      }

      lastIndex = m.end;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      elements.push(...formatBasicInlineMarkdown(remainingText, key++));
    }

    return elements.length > 0 ? <>{elements}</> : text;
  };

  const formatBasicInlineMarkdown = (text: string, startKey: number): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    let key = startKey;

    // Process bold **text** or __text__
    const boldRegex = /\*\*(.*?)\*\*|__(.*?)__/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        // Process italic in the text before bold
        elements.push(...formatItalic(text.substring(lastIndex, match.index), key++));
      }
      elements.push(
        <strong key={key++} className="font-bold text-white">
          {match[1] || match[2]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      elements.push(...formatItalic(text.substring(lastIndex), key++));
    }

    return elements;
  };

  const formatItalic = (text: string, startKey: number): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    let key = startKey;

    // Handle italic *text* or _text_ (avoiding conflicts with bold)
    const italicRegex = /(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g;
    let lastIndex = 0;
    let match;

    while ((match = italicRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        // Process strikethrough in text before italic
        elements.push(...formatStrikethrough(text.substring(lastIndex, match.index), key++));
      }
      elements.push(
        <em key={key++} className="italic text-gray-300">
          {match[1] || match[2]}
        </em>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      elements.push(...formatStrikethrough(text.substring(lastIndex), key++));
    }

    return elements;
  };

  const formatStrikethrough = (text: string, startKey: number): React.ReactNode[] => {
    // Handle strikethrough ~~text~~
    const strikeRegex = /~~(.*?)~~/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = startKey;

    while ((match = strikeRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        elements.push(text.substring(lastIndex, match.index));
      }
      elements.push(
        <del key={key++} className="line-through text-gray-400">
          {match[1]}
        </del>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }

    return elements.length > 0 ? elements : [text];
  };

  return (
    <div className="blog-content space-y-6">
      {renderContent && renderContent.length > 0 ? renderContent.map((block, index) => {
        switch (block.type) {
          case 'heading':
            const headingClasses = {
              1: 'text-3xl sm:text-4xl md:text-5xl font-black text-white mt-10 mb-6 leading-tight',
              2: 'text-2xl sm:text-3xl md:text-4xl font-bold text-white mt-8 mb-4 leading-tight',
              3: 'text-xl sm:text-2xl md:text-3xl font-bold text-white mt-6 mb-3 leading-tight',
            };
            const headingClass = headingClasses[block.level as keyof typeof headingClasses] || headingClasses[2];
            
            // Render heading based on level
            if (block.level === 1) {
              return (
                <h1 key={index} className={headingClass}>
                  {formatInlineMarkdown(block.content)}
                </h1>
              );
            } else if (block.level === 2) {
              return (
                <h2 key={index} className={headingClass}>
                  {formatInlineMarkdown(block.content)}
                </h2>
              );
            } else {
              return (
                <h3 key={index} className={headingClass}>
                  {formatInlineMarkdown(block.content)}
                </h3>
              );
            }

          case 'paragraph':
            return (
              <p key={index} className="text-base sm:text-lg text-gray-300 leading-relaxed mb-4">
                {formatInlineMarkdown(block.content)}
              </p>
            );

          case 'unordered-list':
            return (
              <ul key={index} className="list-none space-y-2 mb-6 ml-4">
                {block.content.split('\n').map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-3 text-base sm:text-lg text-gray-300 leading-relaxed">
                    <span className="text-[#EB4747] mt-2 flex-shrink-0">•</span>
                    <span>{formatInlineMarkdown(item.trim())}</span>
                  </li>
                ))}
              </ul>
            );

          case 'ordered-list':
            return (
              <ol key={index} className="list-decimal list-inside space-y-2 mb-6 ml-4 marker:text-[#EB4747] marker:font-semibold">
                {block.content.split('\n').map((item, itemIndex) => (
                  <li key={itemIndex} className="text-base sm:text-lg text-gray-300 leading-relaxed pl-2">
                    {formatInlineMarkdown(item.trim())}
                  </li>
                ))}
              </ol>
            );

          case 'image':
            return (
              <div key={index} className="my-8">
                <img
                  src={block.content}
                  alt="Blog content"
                  className="w-full rounded-xl shadow-lg"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            );

          case 'code':
            return (
              <div key={index} className="my-6 relative group">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(block.content);
                    }}
                    className="px-2 py-1 bg-white/10 hover:bg-white/20 text-xs text-gray-300 rounded border border-white/20 transition-colors"
                    title="Copy code"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 overflow-x-auto">
                  <code className="text-sm text-gray-300 font-mono">{block.content}</code>
                </pre>
                {block.language && block.language !== 'text' && (
                  <div className="text-xs text-gray-500 mt-1 ml-2">
                    Language: {block.language}
                  </div>
                )}
              </div>
            );

          case 'table':
            return (
              <div key={index} className="my-6 overflow-x-auto">
                <table className="min-w-full border border-white/10 rounded-xl overflow-hidden">
                  {block.headers && block.headers.length > 0 && (
                    <thead className="bg-white/5">
                      <tr>
                        {block.headers.map((header, headerIndex) => (
                          <th
                            key={headerIndex}
                            className="px-4 py-3 text-left text-sm font-semibold text-white border-b border-white/10"
                          >
                            {formatInlineMarkdown(header)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {block.rows && block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-white/5 transition-colors">
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 text-sm text-gray-300 border-b border-white/5"
                          >
                            {formatInlineMarkdown(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'blockquote':
            return (
              <blockquote key={index} className="my-6 pl-4 border-l-4 border-[#EB4747] bg-[#EB4747]/5 py-3 pr-4 rounded-r-lg">
                <p className="text-base sm:text-lg text-gray-300 leading-relaxed italic">
                  {formatInlineMarkdown(block.content)}
                </p>
              </blockquote>
            );

          case 'hr':
            return (
              <hr key={index} className="my-8 border-t border-white/10" />
            );

          default:
            return null;
        }
      }) : null}
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  user_image?: string;
  content: string;
  created_at: string;
  updated_at?: string;
}

interface RelatedBlogsData {
  related_blogs: BlogPost[];
  suggested_topics: Array<{ title: string; reason: string; trending: boolean; category: string }>;
  insights: string;
  success: boolean;
}

const BlogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  const [blogPost, setBlogPost] = useState<BlogPost | null>(null);
  const [relatedData, setRelatedData] = useState<RelatedBlogsData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const hasViewedRef = React.useRef(false); // Track if we've already incremented views for this session

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    setIsAuthenticated(!!token);
  }, []);

  // Re-check authentication when user state changes
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    setIsAuthenticated(!!token);
  }, [user]);

  // Fetch blog post data
  useEffect(() => {
    const fetchBlogPost = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      // Reset view tracking when ID changes
      if (hasViewedRef.current) {
        hasViewedRef.current = false;
      }

      setLoading(true);
      setError(null);
      try {
        // Use public endpoint - prevent multiple view increments using sessionStorage
        const viewKey = `blog_viewed_${id}`;
        const hasViewed = sessionStorage.getItem(viewKey);
        
        // Only increment views on first visit in this session
        const shouldIncrement = !hasViewed;
        const post = await blogService.getPublicBlogPostById(id, shouldIncrement);
        
        if (!hasViewed && post) {
          // Mark as viewed in this session to prevent duplicate increments
          sessionStorage.setItem(viewKey, 'true');
          hasViewedRef.current = true;
        }
        if (post) {
          setBlogPost(post);
          
          // Fetch like status if authenticated
          if (isAuthenticated) {
            try {
              const likeStatus = await blogService.getLikeStatus(id);
              setIsLiked(likeStatus.liked);
            } catch (err) {
              console.error('Error fetching like status:', err);
            }
          }
          
          // Fetch related blogs and AI suggestions
          try {
            const related = await blogService.getRelatedBlogs(id);
            setRelatedData(related);
          } catch (err) {
            console.error('Error fetching related blogs:', err);
            setRelatedData(null);
          }
          
          // Fetch comments
          try {
            const commentsData = await blogService.getComments(id);
            setComments(commentsData);
          } catch (err) {
            console.error('Error fetching comments:', err);
            setComments([]);
          }
        } else {
          setError('Blog post not found');
        }
      } catch (err: any) {
        console.error('Error fetching blog post:', err);
        setError(err.message || 'Failed to load blog post');
      } finally {
        setLoading(false);
      }
    };

    fetchBlogPost();
  }, [id, isAuthenticated]);

  // Fetch user and onboarding data on component mount
  useEffect(() => {
    const loadUserAndOnboardingData = async () => {
      const token = localStorage.getItem('access_token');
      const cachedUser = localStorage.getItem('user');
      
      // Set cached user immediately for faster rendering
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser));
        } catch (e) {
          console.error('Error parsing cached user data:', e);
        }
      }
      
      // If authenticated, fetch fresh onboarding data from API (includes profile picture)
      if (token) {
        try {
          const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Update onboarding step 1 data (includes profile_picture_url for form users)
            if (data?.step1) {
              setOnboardingStep1(data.step1);
              // Cache for offline use
              localStorage.setItem('onboarding_step1', JSON.stringify(data.step1));
            }
            
            // Also refresh user data to get latest profile info
            const userResponse = await fetch(API_ENDPOINTS.AUTH.ME, {
              headers: { Authorization: `Bearer ${token}` },
            });
            
            if (userResponse.ok) {
              const userData = await userResponse.json();
              setUser(userData);
              localStorage.setItem('user', JSON.stringify(userData));
            }
          }
        } catch (error) {
          console.error('Failed to fetch onboarding/user data:', error);
          // Fall back to cached data if API fails
          const cachedOnboarding = localStorage.getItem('onboarding_step1');
          if (cachedOnboarding) {
            try {
              setOnboardingStep1(JSON.parse(cachedOnboarding));
            } catch (e) {
              console.error('Error parsing cached onboarding data:', e);
            }
          }
        }
      }
    };
    
    loadUserAndOnboardingData();
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    navigate('/');
  }, [navigate]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      // Directly redirect to login without showing alert
      navigate('/login');
      return;
    }
    
    if (!id) return;
    
    try {
      const result = await blogService.toggleLike(id);
      setIsLiked(result.liked);
      if (blogPost) {
        setBlogPost({ ...blogPost, likes: result.total_likes });
      }
    } catch (err: any) {
      console.error('Error toggling like:', err);
      if (err.message?.includes('sign in') || err.message?.includes('Please sign in')) {
        // Directly redirect to login without showing alert
        navigate('/login');
      } else {
        alert(err.message || 'Failed to like post');
      }
    }
  }, [isLiked, isAuthenticated, id, blogPost, navigate]);

  const handleBookmark = useCallback(() => {
    setIsBookmarked(!isBookmarked);
    // TODO: Implement API call to bookmark/unbookmark post
  }, [isBookmarked]);

  const handleAddComment = useCallback(async () => {
    if (!isAuthenticated) {
      // Directly redirect to login without showing alert
      navigate('/login');
      return;
    }
    
    if (!id || !newComment.trim()) return;
    
    setCommentsLoading(true);
    try {
      const comment = await blogService.addComment(id, newComment.trim());
      setComments(prev => [comment, ...prev]);
      setNewComment('');
      if (blogPost) {
        setBlogPost({ ...blogPost, comments: (blogPost.comments || 0) + 1 });
      }
    } catch (err: any) {
      console.error('Error adding comment:', err);
      if (err.message?.includes('sign in') || err.message?.includes('Please sign in')) {
        // Directly redirect to login without showing alert
        navigate('/login');
      } else {
        alert(err.message || 'Failed to add comment');
      }
    } finally {
      setCommentsLoading(false);
    }
  }, [isAuthenticated, id, newComment, blogPost, navigate]);

  const [deleteCommentConfirm, setDeleteCommentConfirm] = useState<{ show: boolean; commentId: string | null; commentContent: string }>({
    show: false,
    commentId: null,
    commentContent: ''
  });

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!id) return;
    
    const comment = comments.find(c => c.id === commentId);
    setDeleteCommentConfirm({
      show: true,
      commentId,
      commentContent: comment?.content || ''
    });
  }, [id, comments]);

  const handleDeleteCommentConfirm = useCallback(async () => {
    if (!id || !deleteCommentConfirm.commentId) return;
    
    try {
      await blogService.deleteComment(id, deleteCommentConfirm.commentId);
      setComments(prev => prev.filter(c => c.id !== deleteCommentConfirm.commentId));
      if (blogPost) {
        setBlogPost({ ...blogPost, comments: Math.max(0, (blogPost.comments || 0) - 1) });
      }
      setDeleteCommentConfirm({ show: false, commentId: null, commentContent: '' });
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      alert(err.message || 'Failed to delete comment');
      setDeleteCommentConfirm({ show: false, commentId: null, commentContent: '' });
    }
  }, [id, blogPost, deleteCommentConfirm.commentId]);

  const handleDeleteCommentCancel = useCallback(() => {
    setDeleteCommentConfirm({ show: false, commentId: null, commentContent: '' });
  }, []);

  // Format date
  const formatDate = useCallback((dateString?: string) => {
    if (!dateString) return 'Recently';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  }, []);

  // Calculate read time from content
  const calculateReadTime = useCallback((content?: string) => {
    if (!content) return '1 min read';
    const words = content.split(/\s+/).filter(word => word.length > 0).length;
    const readTime = Math.max(1, Math.ceil(words / 200));
    return `${readTime} min read`;
  }, []);

  // Get author info from backend (backend now provides author_name and author_image for all posts)
  const authorInfo = useMemo(() => {
    if (blogPost) {
      // Backend provides author_name and author_image with proper auth provider handling
      const authorName = blogPost.author_name || (blogPost as any).author || 'FluxWell Team';
      const authorImage = blogPost.author_image || (blogPost as any).authorImage || null;
      return { name: authorName, image: authorImage };
    }
    return { name: 'FluxWell Team', image: null };
  }, [blogPost]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#EB4747] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading blog post...</p>
        </div>
      </div>
    );
  }

  if (error || !blogPost) {
    return (
      <div className="min-h-screen bg-[#121212] text-white font-['Manrope'] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Blog Post Not Found</h1>
          <p className="text-gray-400 mb-6">{error || 'The blog post you are looking for does not exist.'}</p>
          <Link to="/feed" className="text-[#EB4747] hover:underline">
            Return to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      <style>{`
        .blog-content h1, .blog-content h2, .blog-content h3 {
          scroll-margin-top: 100px;
        }
        .blog-content p {
          text-align: justify;
          hyphens: auto;
        }
        .blog-content img {
          max-width: 100%;
          height: auto;
        }
        .blog-content strong {
          font-weight: 700;
        }
        .blog-content em {
          font-style: italic;
        }
        .blog-content code {
          font-family: 'Courier New', Courier, monospace;
        }
        .blog-content pre {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) rgba(255, 255, 255, 0.05);
        }
        .blog-content pre::-webkit-scrollbar {
          height: 8px;
        }
        .blog-content pre::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .blog-content pre::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .blog-content pre::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .blog-content table {
          border-collapse: collapse;
        }
        .blog-content a {
          word-break: break-word;
        }
        @media (max-width: 640px) {
          .blog-content p {
            text-align: left;
          }
          .blog-content pre {
            font-size: 0.8rem;
          }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-in {
          animation: fade-in 0.2s ease-in;
        }
      `}</style>
      {/* Conditional Header - Home page header for unauthorized, Dashboard header for authorized */}
      {!isAuthenticated ? (
        <Header />
      ) : (
        <header className="w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 md:px-10 h-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
              </Link>
              <Link to="/dashboard">
                <h2 className="text-xl sm:text-2xl font-bold font-['Lexend'] tracking-tight">
                  <span className="text-white">Flux</span>
                  <span className="text-[#EB4747]">Well</span>
                </h2>
              </Link>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">Dashboard</Link>
              <Link to="/workouts" className="text-gray-400 hover:text-white transition-colors">Workouts</Link>
              <Link to="/nutrition" className="text-gray-400 hover:text-white transition-colors">Nutrition</Link>
              <Link to="/realtime" className="text-gray-400 hover:text-white transition-colors">Tracking</Link>
              <Link to="/coach" className="text-gray-400 hover:text-white transition-colors">Coach</Link>
              <Link to="/progress" className="text-gray-400 hover:text-white transition-colors">Progress</Link>
              <Link to="/blog" className="text-[#EB4747] font-semibold">Blog</Link>
              <Link to="/practice" className="text-gray-400 hover:text-white transition-colors">Practice Room</Link>
            </nav>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleLogout} 
                className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10 transition-colors"
              >
                Logout
              </button>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
                {(() => {
                  // Comprehensive profile picture resolution logic
                  // Priority: direct profile_picture_url → Google → Fitbit → onboarding form → initials
                  
                  // Check for direct profile picture (works for all auth providers)
                  if (user?.profile_picture_url) {
                    return (
                      <img 
                        src={user.profile_picture_url} 
                        alt={user?.full_name || 'Profile'} 
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          // Fallback to initials if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-sm font-semibold">${user?.full_name?.[0] || 'U'}</span>`;
                          }
                        }}
                      />
                    );
                  }
                  
                  // Check for form user profile picture from onboarding data
                  if (onboardingStep1?.profile_picture_url) {
                    return (
                      <img 
                        src={onboardingStep1.profile_picture_url} 
                        alt={user?.full_name || 'Profile'} 
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-sm font-semibold">${user?.full_name?.[0] || 'U'}</span>`;
                          }
                        }}
                      />
                    );
                  }
                  
                  // Fallback to initials
                  return <span className="text-sm font-semibold">{user?.full_name?.[0] || 'U'}</span>;
                })()}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`${!isAuthenticated ? 'pt-[73px]' : 'pt-[73px]'} pb-16 sm:pb-20`}>
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-10">
          {/* Back Button - Not sticky, just at top */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 sm:mb-8 mt-4 sm:mt-6 group"
          >
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back to Blog</span>
          </button>

          {/* Featured Image */}
          {(blogPost.imageUrl || (blogPost as any).image_url) && (
            <div className="w-full h-[250px] sm:h-[350px] md:h-[450px] lg:h-[550px] rounded-2xl overflow-hidden mb-8 sm:mb-10 shadow-2xl">
              <img
                src={blogPost.imageUrl || (blogPost as any).image_url}
                alt={blogPost.title}
                className="w-full h-full object-cover"
                loading="eager"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="400"%3E%3Crect fill="%23e60a15" width="800" height="400"/%3E%3C/svg%3E';
                }}
              />
            </div>
          )}

          {/* Article Header */}
          <div className="mb-8 sm:mb-10">
            {/* Category Tag */}
            {(blogPost.category || (blogPost as any).category) && (
              <div className="mb-4 sm:mb-5">
                <span className="inline-block px-4 py-1.5 bg-[#EB4747]/20 border border-[#EB4747]/50 text-[#EB4747] text-xs sm:text-sm font-semibold rounded-full">
                  {(blogPost.category || (blogPost as any).category || 'General').charAt(0).toUpperCase() + (blogPost.category || (blogPost as any).category || 'General').slice(1)}
                </span>
              </div>
            )}

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white mb-5 sm:mb-6 leading-tight tracking-tight">
              {blogPost.title}
            </h1>

            {/* Author Info and Meta */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden border-2 border-white/20 bg-white/10 flex items-center justify-center flex-shrink-0">
                  {authorInfo.image ? (
                    <img
                      src={authorInfo.image}
                      alt={authorInfo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const next = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                        if (next) next.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <span className={`text-base sm:text-lg font-semibold text-white ${authorInfo.image ? 'hidden' : ''}`}>
                    {authorInfo.name[0]?.toUpperCase() || 'F'}
                  </span>
                </div>
                <div>
                  <p className="text-sm sm:text-base font-semibold text-white">{authorInfo.name}</p>
                  <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                    {formatDate(blogPost.published_at || blogPost.created_at)} · {calculateReadTime(blogPost.content)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleLike}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border transition-all ${
                    isLiked
                      ? 'bg-[#EB4747]/20 border-[#EB4747]/50 text-[#EB4747] shadow-lg shadow-[#EB4747]/20'
                      : 'bg-white/5 border-white/20 text-gray-400 hover:bg-white/10 hover:border-white/30'
                  }`}
                >
                  <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span className="text-sm font-semibold">{blogPost.likes || 0}</span>
                </button>
                <button
                  onClick={handleBookmark}
                  className={`p-2.5 sm:p-3 rounded-xl border transition-all ${
                    isBookmarked
                      ? 'bg-[#EB4747]/20 border-[#EB4747]/50 text-[#EB4747] shadow-lg shadow-[#EB4747]/20'
                      : 'bg-white/5 border-white/20 text-gray-400 hover:bg-white/10 hover:border-white/30'
                  }`}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  <svg className="w-5 h-5" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                <button 
                  className="p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/20 text-gray-400 hover:bg-white/10 hover:border-white/30 transition-all"
                  title="Share"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: blogPost.title,
                        text: blogPost.excerpt,
                        url: window.location.href,
                      }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                      alert('Link copied to clipboard!');
                    }
                  }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 sm:gap-8 text-sm sm:text-base text-gray-400 pb-6 sm:pb-8 border-b border-white/10">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="font-medium">{(blogPost.views || 0).toLocaleString()} views</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="font-medium">{blogPost.comments || 0} comments</span>
              </div>
            </div>
          </div>

          {/* Article Content */}
          {blogPost.content && (
            <article className="mb-12 sm:mb-16">
              <MarkdownContent content={blogPost.content} />
            </article>
          )}

          {/* Tags */}
          {blogPost.tags && blogPost.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 sm:gap-3 mb-12 sm:mb-16 pt-6 sm:pt-8 border-t border-white/10">
              <span className="text-sm sm:text-base text-gray-400 font-medium mr-2">Tags:</span>
              {blogPost.tags.map((tag, index) => (
                <Link
                  key={`tag-${index}-${tag}`}
                  to={`/feed?tag=${encodeURIComponent(tag)}`}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 hover:border-white/20 text-xs sm:text-sm font-medium rounded-full transition-all"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* Comments Section */}
          <div className="mt-12 sm:mt-16 pt-8 sm:pt-10 border-t border-white/10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6 sm:mb-8">
              Comments ({blogPost.comments || 0})
            </h2>
            
            {/* Add Comment Form */}
            <div className="mb-8">
              {isAuthenticated ? (
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-1">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment..."
                      className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#EB4747]/50 resize-none"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || commentsLoading}
                    className="px-4 sm:px-6 py-3 bg-[#EB4747] text-white font-semibold rounded-xl hover:bg-[#d10a14] transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-end"
                  >
                    {commentsLoading ? 'Posting...' : 'Post'}
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-[#1a1a1a] border border-white/10 rounded-xl text-center">
                  <p className="text-gray-400 mb-3">Sign in to join the conversation</p>
                  <Link
                    to="/login"
                    className="inline-block px-6 py-2 bg-[#EB4747] text-white font-semibold rounded-lg hover:bg-[#d10a14] transition-colors"
                  >
                    Sign In
                  </Link>
                </div>
              )}
            </div>

            {/* Comments List */}
            <div className="space-y-4 sm:space-y-6">
              {comments.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No comments yet. Be the first to comment!</p>
              ) : (
                comments.map((comment) => {
                  const isCommentOwner = isAuthenticated && user && String(comment.user_id) === String(user._id || user.id);
                  return (
                    <div key={comment.id} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 sm:p-5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10 flex-shrink-0">
                          {comment.user_image ? (
                            <img
                              src={comment.user_image}
                              alt={comment.user_name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                const next = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                if (next) next.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <span className={`text-sm sm:text-base font-semibold text-white ${comment.user_image ? 'hidden' : ''}`}>
                            {comment.user_name[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm sm:text-base font-semibold text-white">{comment.user_name}</p>
                              <p className="text-xs text-gray-400">{formatDate(comment.created_at)}</p>
                            </div>
                            {isCommentOwner && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                title="Delete comment"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <p className="text-sm sm:text-base text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Related Posts & AI Suggestions */}
          {relatedData && (relatedData.related_blogs.length > 0 || relatedData.suggested_topics.length > 0) && (
            <div className="mt-12 sm:mt-16 pt-8 sm:pt-10 border-t border-white/10">
              {relatedData.insights && (
                <div className="mb-6 sm:mb-8 p-4 sm:p-5 bg-[#EB4747]/10 border border-[#EB4747]/30 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-[#EB4747]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-lg sm:text-xl font-bold text-[#EB4747]">AI Insights</h3>
                  </div>
                  <p className="text-sm sm:text-base text-gray-300 leading-relaxed">{relatedData.insights}</p>
                </div>
              )}

              {relatedData.related_blogs.length > 0 && (
                <>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6 sm:mb-8">Related Articles</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
                    {relatedData.related_blogs.map((post) => {
                      const postImageUrl = post.imageUrl || (post as any).image_url;
                      return (
                        <Link
                          key={post.id}
                          to={`/blog/${post.id}`}
                          className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden hover:border-[#EB4747]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#EB4747]/10 group"
                        >
                          {postImageUrl && (
                            <div className="h-[160px] sm:h-[180px] md:h-[200px] relative overflow-hidden">
                              <img
                                src={postImageUrl}
                                alt={post.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Crect fill="%23e60a15" width="400" height="200"/%3E%3C/svg%3E';
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                          <div className="p-4 sm:p-5">
                            <h3 className="text-base sm:text-lg font-bold text-white mb-2 sm:mb-3 line-clamp-2 group-hover:text-[#EB4747] transition-colors">
                              {post.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-400 line-clamp-2 mb-3 sm:mb-4 leading-relaxed">
                              {post.excerpt}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{formatDate(post.published_at || post.created_at)}</span>
                              <span>·</span>
                              <span>{calculateReadTime(post.content)}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {relatedData.suggested_topics.length > 0 && (
                <div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6 sm:mb-8">Suggested Topics</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {relatedData.suggested_topics.map((topic, index) => (
                      <div
                        key={index}
                        className="p-4 sm:p-5 bg-[#1a1a1a] border border-white/10 rounded-xl hover:border-[#EB4747]/30 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-base sm:text-lg font-bold text-white flex-1">{topic.title}</h3>
                          {topic.trending && (
                            <span className="px-2 py-1 bg-[#EB4747]/20 text-[#EB4747] text-xs font-semibold rounded-full flex-shrink-0">
                              Trending
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">{topic.reason}</p>
                        <Link
                          to={`/blog/create`}
                          state={{ topic: topic.title }}
                          className="text-sm text-[#EB4747] hover:text-[#d10a14] font-medium transition-colors"
                        >
                          Create Blog →
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Delete Comment Confirmation Modal */}
      {deleteCommentConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={handleDeleteCommentCancel}>
          <div className="bg-[#1a1a1a] border border-white/20 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              Delete Comment?
            </h3>
            <p className="text-sm sm:text-base text-gray-400 text-center mb-4 line-clamp-2">
              {deleteCommentConfirm.commentContent}
            </p>
            <p className="text-xs sm:text-sm text-gray-500 text-center mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 sm:gap-4">
              <button
                onClick={handleDeleteCommentCancel}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-lg transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCommentConfirm}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogDetailPage;

