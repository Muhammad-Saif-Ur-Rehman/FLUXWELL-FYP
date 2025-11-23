import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { blogService, BlogPost } from '../services/blogService';
import { API_ENDPOINTS } from '../config/api';
import Header from '../components/ui/Header';

const PublicFeedPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const categories = useMemo(() => [
    { id: 'all', label: 'All', tag: null },
    { id: 'nutrition', label: '#Nutrition', tag: 'nutrition' },
    { id: 'workout', label: '#Workout', tag: 'workout' },
    { id: 'wellness', label: '#Wellness', tag: 'wellness' },
    { id: 'mindset', label: '#Mindset', tag: 'mindset' },
    { id: 'fitness', label: '#Fitness', tag: 'fitness' },
    { id: 'health', label: '#Health', tag: 'health' },
  ], []);

  // Fetch public blog posts (always fetch a broad set; filter client-side for responsive UX)
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await blogService.getPublicBlogPosts({
          // Do not pass category; fetch a wider set and filter locally
          search: searchQuery.trim() || undefined,
          page: 1,
          limit: 100,
        });
        setBlogPosts(response.posts || []);
      } catch (err: any) {
        console.error('Error fetching public blog posts:', err);
        setError(err.message || 'Failed to load blog posts');
        setBlogPosts([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce search query
    const timeoutId = setTimeout(() => {
      fetchPosts();
    }, searchQuery ? 500 : 0);

    return () => clearTimeout(timeoutId);
  }, [selectedCategory, searchQuery]);

  // Filter blog posts based on search and category (client-side filtering)
  const filteredPosts = useMemo(() => {
    if (loading) return [];
    return blogPosts.filter(post => {
      const matchesSearch = searchQuery.trim() === '' || 
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.category?.toLowerCase().includes(searchQuery.toLowerCase());

      // Robust category match: match post.category or tags array, both normalized
      const matchesCategory = (() => {
        if (selectedCategory === 'all') return true;
        const target = selectedCategory.toLowerCase();
        const categories: string[] = [];
        if (post.category) categories.push(String(post.category).toLowerCase());
        const tags = (post as any).tags as string[] | undefined;
        if (Array.isArray(tags)) {
          for (const t of tags) categories.push(String(t).toLowerCase());
        }
        return categories.includes(target);
      })();

      return matchesSearch && matchesCategory;
    });
  }, [blogPosts, searchQuery, selectedCategory, loading]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    const token = localStorage.getItem('access_token');
    
    setIsAuthenticated(!!token);
    
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        
        // Load onboarding data from API for form users to get profile picture
        if (parsedUser?.auth_provider === 'form' && token) {
          const loadOnboardingData = async () => {
            try {
              const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data?.step1) {
                  setOnboardingStep1(data.step1);
                }
              }
            } catch (error) {
              console.error('Failed to load onboarding data:', error);
            }
          };
          
          loadOnboardingData();
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    navigate('/');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
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
              <Link to="/blog" className="text-gray-400 hover:text-white transition-colors">Blog</Link>
              <Link to="/practice" className="text-gray-400 hover:text-white transition-colors">Practice Room</Link>
            </nav>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleLogout} 
                className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10 transition-colors"
              >
                Logout
              </button>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
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
      )}

      {/* Main Content */}
      <main className={`${!isAuthenticated ? 'pt-[73px]' : 'pt-[73px]'} pb-10 px-4 sm:px-6 md:px-10`}>
        <div className="max-w-[1280px] mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 mt-6 sm:mt-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight mb-4 sm:mb-6">
              Discover Health Insights
            </h1>
            
            {/* Search Bar */}
            <div className="max-w-[600px] mx-auto mb-4 sm:mb-6">
              <div className="bg-[#1a1a1a] border border-white/20 rounded-full h-11 sm:h-12 flex items-center px-4 sm:px-5 gap-3">
                <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search health, fitness, or nutrition topics…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm sm:text-base text-gray-400 placeholder-gray-500 border-none outline-none"
                />
              </div>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`h-8 sm:h-9 px-3 sm:px-4 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                    selectedCategory === category.id
                      ? 'bg-[#EB4747]/20 border border-[#EB4747]/50 text-white'
                      : 'bg-white/5 border border-white/20 text-gray-300 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {/* Blog Posts Grid */}
          {loading ? (
            <div className="text-center py-16 sm:py-20">
              <div className="w-12 h-12 border-4 border-[#EB4747] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-lg sm:text-xl text-gray-400">Loading blog posts...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 sm:py-20">
              <p className="text-lg sm:text-xl text-red-400 mb-2">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-[#EB4747] text-white rounded-lg hover:bg-[#d10a14] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
                {filteredPosts.map((post) => (
                  <BlogPostCard key={post.id} post={post} currentUser={user} onboardingData={onboardingStep1} />
                ))}
              </div>

              {/* Empty State */}
              {filteredPosts.length === 0 && (
                <div className="text-center py-16 sm:py-20">
                  <p className="text-lg sm:text-xl text-gray-400 mb-2">No blog posts found</p>
                  <p className="text-sm text-gray-500">
                    Try adjusting your search or category filter
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

// Memoized Blog Post Card Component
const BlogPostCard = memo<{ post: BlogPost; currentUser: any; onboardingData: any }>(({ post, currentUser, onboardingData }) => {
  const [summary, setSummary] = useState<string>('');
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Helpers to clean markdown for title/excerpt
  const stripMarkdown = useCallback((text?: string): string => {
    if (!text) return '';
    return String(text)
      // Remove headings, emphasis, inline code, links
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);

  // Derive author info (support multiple possible fields from backend) - robust resolver
  const resolveAuthorName = useCallback((p: any): string => {
    // Backend now provides author_name directly
    if (p.author_name) {
      return String(p.author_name).trim();
    }
    
    // Fallback to other possible fields
    const candidates = [
      p.user_name,
      p.author,
      p.owner_name,
      p.created_by_name,
      p.posted_by,
      p.user?.full_name,
      p.user?.fullName,
      p.user?.name,
      p.user?.displayName,
      p.user?.username,
      p.authorFullName,
      p.createdByName,
      p.postedBy,
    ].filter(Boolean);
    const name = candidates.length ? String(candidates[0]).trim() : '';
    if (name) return name;
    
    // As a very last resort try email username
    const email = p.author_email || p.user?.email || p.user_email;
    if (email && typeof email === 'string' && email.includes('@')) {
      const username = email.split('@')[0];
      return username.charAt(0).toUpperCase() + username.slice(1);
    }
    
    return 'Anonymous User';
  }, []);

  const resolveAuthorImage = useCallback((p: any): string | null => {
    // Backend provides author_image for all published posts (works for authenticated and non-authenticated users)
    if (p.author_image && typeof p.author_image === 'string' && p.author_image.trim()) {
      return p.author_image.trim();
    }
    
    // Only check current user data if user is authenticated and this is their post
    if (currentUser && p.user_id === currentUser.id) {
      const provider = currentUser?.auth_provider;
      if (provider === 'google' || provider === 'fitbit') {
        if (currentUser?.profile_picture_url) return currentUser.profile_picture_url;
      } else if (provider === 'form' && onboardingData?.profile_picture_url) {
        return onboardingData.profile_picture_url;
      }
    }
    
    // Fallback to legacy fields (for backward compatibility)
    const candidates = [
      p.user_image,
      p.user?.profile_picture_url,
      p.user?.avatarUrl,
      p.user?.avatar,
      p.user?.image_url
    ].filter(val => val && typeof val === 'string' && val.trim());
    
    return candidates.length > 0 ? String(candidates[0]).trim() : null;
  }, [currentUser, onboardingData]);

  const authorName = useMemo(() => resolveAuthorName(post), [post, resolveAuthorName]);
  const authorImage = useMemo(() => {
    const img = resolveAuthorImage(post);
    if (!img) {
      console.log(`No author image found for post "${post.title}" by ${resolveAuthorName(post)}. Post data:`, {
        author_image: post.author_image,
        user_id: post.user_id,
        author_name: post.author_name
      });
    }
    return img;
  }, [post, resolveAuthorImage, resolveAuthorName]);
  const imageUrl = post.imageUrl || (post as any).image_url;
  const category = (post.category || (Array.isArray((post as any).tags) ? (post as any).tags?.[0] : 'general'))?.toString().toLowerCase();

  // Handle summary generation
  const handleGenerateSummary = useCallback(async () => {
    if (summary) {
      // Toggle summary display if already generated
      setShowSummary(!showSummary);
      return;
    }

    // Check if content is available
    const content = post.content || '';
    if (!content || content.trim().length < 50) {
      setSummaryError('Content not available for summarization.');
      setShowSummary(true);
      return;
    }

    setIsLoadingSummary(true);
    setSummaryError(null);
    setShowSummary(true);

    try {
      const result = await blogService.summarizePublicBlog(post.title, content);
      if (result.success && result.summary) {
        setSummary(result.summary);
      } else {
        setSummaryError('Failed to generate summary. Please try again.');
        setShowSummary(false);
      }
    } catch (error: any) {
      console.error('Error generating summary:', error);
      setSummaryError(error.message || 'Failed to generate summary. Please try again.');
      setShowSummary(false);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [post.title, post.content, summary, showSummary]);

  return (
    <article className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden hover:border-[#EB4747]/30 transition-all duration-300 hover:shadow-lg hover:shadow-[#EB4747]/10">
      {/* Post Image */}
      {imageUrl && (
        <div className="h-[180px] sm:h-[200px] lg:h-[220px] relative overflow-hidden">
          <img
            src={imageUrl}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Crect fill="%23e60a15" width="400" height="200"/%3E%3C/svg%3E';
            }}
          />
        </div>
      )}

      {/* Post Content */}
      <div className="p-4 sm:p-5">
        {/* Category Tag */}
        {category && category !== 'all' && (
          <div className="mb-2">
            <span className="inline-block px-2 py-1 bg-[#EB4747]/20 border border-[#EB4747]/50 text-[#EB4747] text-xs font-semibold rounded-full">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </span>
          </div>
        )}

        {/* Title */}
        <h2 className="text-base sm:text-lg font-bold text-white mb-3 line-clamp-2 min-h-[3rem]">
          {stripMarkdown(post.title)}
        </h2>

        {/* Author Info */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden flex-shrink-0 border border-white/10 bg-white/10 flex items-center justify-center relative">
            {authorImage ? (
              <>
                <img
                  src={authorImage}
                  alt={authorName}
                  className="w-full h-full object-cover absolute inset-0"
                  loading="lazy"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    console.error(`Failed to load author image for ${authorName}:`, authorImage);
                    target.style.display = 'none';
                  }}
                />
                <span className="text-xs sm:text-sm font-semibold text-white pointer-events-none">
                  {String(authorName || 'U').charAt(0).toUpperCase()}
                </span>
              </>
            ) : (
              <span className="text-xs sm:text-sm font-semibold text-white">
                {String(authorName || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-xs sm:text-sm text-gray-400">{authorName}</span>
        </div>

        {/* Excerpt */}
        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed mb-4 sm:mb-5 line-clamp-2 min-h-[2.5rem]">
          {(() => {
            const raw = post.excerpt && post.excerpt.trim().length > 0 ? post.excerpt : (post.content || '');
            const cleaned = stripMarkdown(raw);
            if (!cleaned) return 'No excerpt available';
            return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned;
          })()}
        </p>

        {/* Summary Section */}
        {showSummary && (
          <div className="mb-4 p-3 sm:p-4 bg-[#EB4747]/10 border border-[#EB4747]/30 rounded-lg">
            {isLoadingSummary ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#EB4747] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-gray-400">Generating summary...</p>
              </div>
            ) : summaryError ? (
              <p className="text-xs text-red-400">{summaryError}</p>
            ) : summary ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[#EB4747] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs sm:text-sm font-semibold text-[#EB4747]">AI Summary</span>
                </div>
                <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                    {summary}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
          {post.views !== undefined && (
            <span>👁 {post.views.toLocaleString()}</span>
          )}
          {post.likes !== undefined && (
            <span>❤️ {post.likes.toLocaleString()}</span>
          )}
          {post.read_time && (
            <span>⏱ {post.read_time}</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerateSummary}
            disabled={isLoadingSummary || !post.content || post.content.trim().length < 50}
            className={`flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
              isLoadingSummary || (!post.content || post.content.trim().length < 50)
                ? 'bg-gray-600/50 text-gray-500 cursor-not-allowed'
                : showSummary && summary
                ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-[#EB4747]/50'
            }`}
            title={!post.content || post.content.trim().length < 50 ? 'Content not available for summarization' : ''}
          >
            {isLoadingSummary ? (
              <span className="flex items-center justify-center gap-1.5">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Generating...</span>
              </span>
            ) : showSummary && summary ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                <span>Hide Summary</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Summary</span>
              </span>
            )}
          </button>
          <Link
            to={`/blog/${post.id}`}
            className="flex-1 px-3 py-2 bg-[#EB4747] text-white text-xs sm:text-sm font-semibold text-center rounded-lg hover:bg-[#d10a14] transition-colors"
          >
            Read More
          </Link>
        </div>
      </div>
    </article>
  );
});

BlogPostCard.displayName = 'BlogPostCard';

export default PublicFeedPage;
