import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../config/api';
import { blogService, BlogPost, AnalyticsMetrics, TopicSuggestion } from '../services/blogService';
import { motion } from 'framer-motion';

// Type definitions for chart components
interface ViewData {
  date: string;
  views: number;
}

interface EngagementData {
  week: string;
  engagement: number;
  raw_engagement?: number;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
  count?: number;
  views?: number;
  engagement?: number;
}

const BlogPage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'drafts' | 'published'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null; title: string }>({
    show: false,
    id: null,
    title: ''
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    
    if (userData) {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    // Load onboarding data from API for form users to get profile picture
    const loadOnboardingData = async () => {
      try {
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken) return;
        
        const response = await fetch(API_ENDPOINTS.AUTH.ONBOARDING_DATA, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
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
  }, []);

  // Fetch blog data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch blog posts
        // Map activeTab to API status format: 'drafts' -> 'draft', 'published' -> 'published'
        const status = activeTab === 'all' 
          ? undefined 
          : activeTab === 'drafts' 
            ? 'draft' 
            : activeTab === 'published'
              ? 'published'
              : undefined;
        const postsData = await blogService.getBlogPosts({
          status: status as 'draft' | 'published' | undefined,
          search: searchQuery || undefined,
          page: 1,
          limit: 50,
        });
        setBlogPosts(postsData.posts || []);

        // Fetch analytics - handle errors gracefully
        try {
          const analyticsData = await blogService.getAnalytics();
          // Client-side fallbacks if backend returns empty series
          let nextAnalytics = analyticsData;

          // Fallback: build top_categories from fetched posts if missing
          if (!nextAnalytics?.top_categories || nextAnalytics.top_categories.length === 0) {
            const counts: Record<string, number> = {};
            (postsData.posts || []).forEach((p) => {
              const base = (p.category || ((p as any).tags && (p as any).tags[0]) || 'General') as string;
              const key = String(base).toLowerCase();
              counts[key] = (counts[key] || 0) + 1;
            });
            const total = Object.values(counts).reduce((s, v) => s + v, 0);
            const palette = ['#e60a15', '#ff6b6b', '#ffa500', '#9b59b6', '#3498db', '#2ecc71'];
            const derived = Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name, count], idx) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value: total > 0 ? Math.max(1, Math.round((count / total) * 100)) : 0,
                color: palette[idx % palette.length],
                count,
              }));
            // Normalize to 100%
            const sum = derived.reduce((s, x) => s + x.value, 0);
            if (sum !== 100 && derived.length > 0) {
              const diff = sum - 100;
              derived[0].value = Math.max(1, derived[0].value - diff);
            }
            nextAnalytics = { ...nextAnalytics, top_categories: derived };
          }

          // Fallback: synthesize engagement_by_week if missing
          if (!nextAnalytics?.engagement_by_week || nextAnalytics.engagement_by_week.length === 0) {
            const base = [0.5, 0.65, 0.8, 1.0, 0.85, 0.7, 0.55];
            const totalInteractions =
              (nextAnalytics?.total_likes || 0) + (nextAnalytics?.total_comments || 0) || 7;
            const totalFactor = base.reduce((s, v) => s + v, 0) || 1;
            let accum = 0;
            const synth = base.map((f, i) => {
              const raw = Math.max(1, Math.round((f / totalFactor) * totalInteractions));
              accum += raw;
              return { label: i, raw };
            });
            const diff = accum - totalInteractions;
            if (diff !== 0 && synth.length > 0) {
              const mid = Math.floor(synth.length / 2);
              synth[mid].raw = Math.max(1, synth[mid].raw - diff);
            }
            const maxRaw = Math.max(...synth.map((s) => s.raw), 1);
            const labels = ['6d ago', '5d ago', '4d ago', '3d ago', '2d ago', 'Yesterday', 'Today'];
            const series = synth.map((s, i) => ({
              week: labels[i] || `D-${6 - i}`,
              engagement: Math.max(1, Math.round((s.raw / maxRaw) * 100)),
              raw_engagement: s.raw,
            }));
            nextAnalytics = { ...nextAnalytics, engagement_by_week: series };
          }

          setAnalytics(nextAnalytics);
        } catch (analyticsErr) {
          console.error('Error fetching analytics:', analyticsErr);
          // Set fallback analytics
          setAnalytics({
            total_blogs: 0,
            total_views: 0,
            total_comments: 0,
            total_likes: 0,
            avg_read_time: '0 min',
            engagement_rate: '0%',
            views_over_time: [],
            engagement_by_week: [],
            top_categories: [],
          });
        }

        // Fetch AI insights - handle errors gracefully
        try {
          const insightsData = await blogService.getAIInsights();
          setAiInsights(insightsData.insights || '');
          setTopicSuggestions(insightsData.suggested_topics || []);
        } catch (insightsErr) {
          console.error('Error fetching AI insights:', insightsErr);
          // Set fallback insights
          setAiInsights('Your content shows good potential. Focus on trending topics in health and fitness.');
          setTopicSuggestions([]);
        }
      } catch (err: any) {
        console.error('Error fetching blog data:', err);
        // Only set error if it's not a network error (network errors are handled in service)
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('Network')) {
          setError(err.message || 'Failed to load blog data. Please try again.');
        } else {
          // For network errors, just show empty state
          setError(null);
        }
        // Set fallback data
        setAnalytics({
          total_blogs: 0,
          total_views: 0,
          total_comments: 0,
          total_likes: 0,
          avg_read_time: '0 min',
          engagement_rate: '0%',
          views_over_time: [],
          engagement_by_week: [],
          top_categories: [],
        });
        // Ensure blogPosts is set to empty array if fetch failed
        setBlogPosts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, searchQuery]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    navigate('/');
  }, [navigate]);

  // Posts are already filtered by the API, but we can do client-side filtering if needed
  const filteredPosts = useMemo(() => {
    return blogPosts;
  }, [blogPosts]);

  // Memoize navigation handler
  const handleCreateBlog = useCallback(() => {
    navigate('/blog/create');
  }, [navigate]);

  const handleViewBlog = useCallback((id: string) => {
    navigate(`/blog/${id}`);
  }, [navigate]);

  const handleEditBlog = useCallback((id: string) => {
    navigate(`/blog/edit/${id}`);
  }, [navigate]);

  const handleDeleteClick = useCallback((id: string, title: string) => {
    setDeleteConfirm({ show: true, id, title });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.id) return;
    
    try {
      await blogService.deleteBlogPost(deleteConfirm.id);
      // Remove from local state
      setBlogPosts(prev => prev.filter(post => post.id !== deleteConfirm.id));
      // Refresh analytics
      try {
        const analyticsData = await blogService.getAnalytics();
        setAnalytics(analyticsData);
      } catch (err) {
        console.error('Error refreshing analytics:', err);
      }
      // Close modal
      setDeleteConfirm({ show: false, id: null, title: '' });
    } catch (error: any) {
      console.error('Error deleting blog post:', error);
      alert(error.message || 'Failed to delete blog post. Please try again.');
      setDeleteConfirm({ show: false, id: null, title: '' });
    }
  }, [deleteConfirm.id]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ show: false, id: null, title: '' });
  }, []);

  const handleGenerateOutlineFromSuggestion = useCallback((topic: string) => {
    navigate('/blog/create', { state: { topic } });
  }, [navigate]);

  const formatNumber = useCallback((num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  }, []);

  // Format AI insights text - handle markdown, line breaks, and special formatting
  const formatAIText = useCallback((text: string): string => {
    if (!text) return '';
    
    // Remove markdown bold/italic markers if present
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
      .replace(/\*(.*?)\*/g, '$1') // Remove *italic*
      .replace(/__(.*?)__/g, '$1') // Remove __bold__
      .replace(/_(.*?)_/g, '$1'); // Remove _italic_
    
    // Replace multiple newlines with single newline
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    // Trim whitespace
    formatted = formatted.trim();
    
    return formatted;
  }, []);

  // Format text with line breaks for display
  const renderFormattedText = useCallback((text: string) => {
    const formatted = formatAIText(text);
    // Split by double newlines for paragraphs, single newlines for line breaks
    return formatted.split('\n\n').map((paragraph, pIndex) => (
      <React.Fragment key={pIndex}>
        {paragraph.split('\n').map((line, lIndex, lines) => (
          <React.Fragment key={lIndex}>
            {line}
            {lIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
        {pIndex < formatted.split('\n\n').length - 1 && (
          <>
            <br />
            <br />
          </>
        )}
      </React.Fragment>
    ));
  }, [formatAIText]);

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
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
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
            <Link to="/practice" className="text-gray-400 hover:text-white transition-colors">Practice Room</Link>
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
      <main className="max-w-[1440px] mx-auto px-3 sm:px-4 md:px-6 lg:px-10 pt-[85px] sm:pt-[93px] md:pt-[103px] pb-20 sm:pb-10">
        <div className="max-w-[1808px] mx-auto">
            {/* Analytics Overview - Reduced Size */}
          <section id="analytics-overview" className="mb-5 sm:mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black mb-3 sm:mb-4 md:mb-6 tracking-tight">
              Analytics Overview
            </h2>
            {loading ? (
              <div className="text-center py-6 sm:py-8">
                <p className="text-sm sm:text-base text-gray-400">Loading analytics...</p>
              </div>
            ) : analytics ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 md:gap-4">
                <MetricCard label="Total Blogs" value={analytics.total_blogs.toString()} />
                <MetricCard label="Total Views" value={formatNumber(analytics.total_views)} />
                <MetricCard label="Comments" value={analytics.total_comments.toLocaleString()} />
                <MetricCard label="Likes" value={analytics.total_likes.toLocaleString()} />
                <MetricCard label="Avg Read Time" value={analytics.avg_read_time} />
                <MetricCard label="Engagement Rate" value={analytics.engagement_rate} />
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">No analytics data available</p>
              </div>
            )}
          </section>

          <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 md:gap-6 lg:gap-8">
            {/* Left Column - Your Blogs */}
            <div className="flex-1 min-w-0">
              <section>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 md:mb-7">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold">Your Blogs</h2>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => navigate('/feed')}
                      className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 md:py-3 bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm md:text-base font-semibold rounded-lg sm:rounded-xl transition-all duration-200 border border-white/20 hover:border-white/30 whitespace-nowrap"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span className="hidden xs:inline">Read Blogs</span>
                      <span className="xs:hidden">Read</span>
                    </button>
                    <button
                      onClick={handleCreateBlog}
                      className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-[#e60a15] hover:bg-[#d10a14] text-white text-xs sm:text-sm md:text-base font-semibold rounded-lg sm:rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 whitespace-nowrap"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="hidden xs:inline">Create Blog</span>
                      <span className="xs:hidden">Create</span>
                    </button>
                  </div>
                </div>
                
                {/* Tabs */}
                <div className="border-b border-white/10 flex gap-0 mb-3 sm:mb-4 md:mb-6 overflow-x-auto scrollbar-hide">
                  <TabButton
                    active={activeTab === 'all'}
                    onClick={() => setActiveTab('all')}
                    label="All"
                  />
                  <TabButton
                    active={activeTab === 'drafts'}
                    onClick={() => setActiveTab('drafts')}
                    label="Drafts"
                  />
                  <TabButton
                    active={activeTab === 'published'}
                    onClick={() => setActiveTab('published')}
                    label="Published"
                  />
        </div>

                {/* Blog Cards */}
                {loading ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400">Loading blogs...</p>
                  </div>
                ) : error ? (
                  <div className="col-span-full text-center py-12">
                    <p className="text-red-400">{error}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                    {filteredPosts.length === 0 ? (
                      <div className="col-span-full text-center py-8 sm:py-12">
                        <p className="text-sm sm:text-base text-gray-400">No blogs found in this category.</p>
                      </div>
                    ) : (
                      filteredPosts.map((post) => (
                        <BlogCard 
                          key={post.id} 
                          post={post} 
                          formatNumber={formatNumber}
                          onDelete={handleDeleteClick}
                          onView={handleViewBlog}
                          onEdit={handleEditBlog}
                        />
                      ))
                    )}
                  </div>
                )}
              </section>

              {/* Performance & Insights with Actual Charts */}
              <section className="mt-6 sm:mt-8 md:mt-12">
                <div className="mb-3 sm:mb-4 md:mb-6">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 sm:mb-3">Performance & Insights</h2>
                  <div className="text-xs sm:text-sm text-gray-400 leading-relaxed">
                    <span className="inline-block mr-1">💡</span>
                    <span className="font-medium text-gray-300">AI Insight:</span>{' '}
                    {aiInsights ? (
                      <span className="text-gray-300">{renderFormattedText(aiInsights)}</span>
                    ) : (
                      <span className="text-gray-500">Analyzing your blog performance...</span>
                    )}
                  </div>
                </div>
                {loading ? (
                  <div className="text-center py-8 sm:py-12">
                    <p className="text-sm sm:text-base text-gray-400">Loading charts...</p>
                  </div>
                ) : analytics ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 w-full">
                    <div className="min-w-0">
                      <ViewsOverTimeChart data={analytics.views_over_time || []} />
                    </div>
                    <div className="min-w-0">
                      <EngagementByWeekChart data={analytics.engagement_by_week || []} />
                    </div>
                    <div className="min-w-0">
                      <TopCategoriesChart data={analytics.top_categories || []} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-400">No chart data available</p>
                  </div>
                )}
              </section>
          </div>

            {/* Right Sidebar */}
            <aside className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 space-y-3 sm:space-y-4 md:space-y-5 order-first lg:order-last">
              {/* AI Insight Card */}
              <div className="bg-[#1a1a1a] border border-[#e60a15]/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5">
                <div className="mb-3 sm:mb-4">
                  <h3 className="text-xs sm:text-sm md:text-base font-bold mb-2 sm:mb-2.5">🧠 AI Insight</h3>
                  <div className="text-xs sm:text-sm text-gray-300 leading-relaxed min-h-[3rem] max-h-[120px] sm:max-h-[150px] overflow-y-auto custom-scrollbar">
                    {aiInsights ? (
                      <div className="whitespace-pre-wrap break-words pr-1">
                        {renderFormattedText(aiInsights)}
                      </div>
                    ) : (
                      <span className="text-gray-500 italic">Analyzing your blog performance...</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button 
                    onClick={async () => {
                      try {
                        const suggestions = await blogService.getTopicSuggestions('general', 5);
                        setTopicSuggestions(suggestions);
                      } catch (err) {
                        console.error('Error fetching topic suggestions:', err);
                      }
                    }}
                    className="flex-1 h-8 sm:h-9 md:h-10 rounded-lg sm:rounded-xl bg-[#e60a15] text-white text-xs sm:text-sm font-medium shadow-lg hover:bg-[#d10a14] transition-colors"
                  >
                    Suggest Topics
                  </button>
                  <button 
                    onClick={() => {
                      // Scroll to analytics section
                      const analyticsSection = document.getElementById('analytics-overview');
                      if (analyticsSection) {
                        analyticsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="flex-1 h-8 sm:h-9 md:h-10 rounded-lg sm:rounded-xl bg-white/10 text-white text-xs sm:text-sm font-medium hover:bg-white/20 transition-colors"
                  >
                    View Analytics
                  </button>
                </div>
            </div>

              {/* AI Topic Suggestions */}
              <div className="bg-[#1a1a1a] border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5">
                <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-bold mb-2 sm:mb-3 md:mb-4">🧠 AI Topic Suggestions</h3>
                {loading ? (
                  <div className="text-center py-3 sm:py-4">
                    <p className="text-xs sm:text-sm text-gray-400">Loading suggestions...</p>
                  </div>
                ) : topicSuggestions.length > 0 ? (
                  <>
                    <div className="space-y-2 sm:space-y-3 mb-2 sm:mb-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                      {topicSuggestions.slice(0, 3).map((topic, index) => (
                        <TopicSuggestionCard
                          key={`topic-suggestion-${index}-${topic.title.substring(0, 20)}`}
                          title={topic.title}
                          reason={topic.reason}
                          onGenerateOutline={handleGenerateOutlineFromSuggestion}
                        />
                      ))}
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const suggestions = await blogService.getTopicSuggestions('general', 5);
                          setTopicSuggestions(suggestions);
                        } catch (err) {
                          console.error('Error regenerating suggestions:', err);
                        }
                      }}
                      className="w-full h-8 sm:h-9 md:h-10 rounded-lg sm:rounded-xl bg-white/10 text-white text-xs sm:text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                      Regenerate Suggestions
                    </button>
                  </>
                ) : (
                  <div className="text-center py-3 sm:py-4">
                    <p className="text-xs sm:text-sm text-gray-400 mb-2">No suggestions available</p>
                    <button 
                      onClick={async () => {
                        try {
                          const suggestions = await blogService.getTopicSuggestions('general', 5);
                          setTopicSuggestions(suggestions);
                        } catch (err) {
                          console.error('Error fetching suggestions:', err);
                        }
                      }}
                      className="w-full h-8 sm:h-9 md:h-10 rounded-lg sm:rounded-xl bg-white/10 text-white text-xs sm:text-sm font-medium hover:bg-white/20 transition-colors"
                    >
                      Generate Suggestions
                    </button>
                  </div>
                )}
            </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Floating Create Blog Button for Mobile */}
      <button
        onClick={handleCreateBlog}
        className="fixed bottom-6 right-6 sm:hidden w-14 h-14 bg-[#e60a15] hover:bg-[#d10a14] text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 z-30"
        aria-label="Create Blog"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={handleDeleteCancel}>
          <div className="bg-[#1a1a1a] border border-white/20 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-500/20 rounded-full">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
              Delete Blog Post?
            </h3>
            <p className="text-sm sm:text-base text-gray-400 text-center mb-6">
              Are you sure you want to delete <span className="font-semibold text-white">"{deleteConfirm.title}"</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 sm:gap-4">
              <button
                onClick={handleDeleteCancel}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-lg transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
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

// Metric Card Component - Reduced Size
const MetricCard: React.FC<{ label: string; value: string }> = React.memo(({ label, value }) => {
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 sm:p-5">
      <p className="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">{label}</p>
      <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
    </div>
  );
});
MetricCard.displayName = 'MetricCard';

// Tab Button Component
const TabButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = React.memo(({
  active,
  onClick,
  label,
}) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
        active
          ? 'text-white border-b-2 border-[#e60a15]'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
});
TabButton.displayName = 'TabButton';

// Blog Card Component
const BlogCard: React.FC<{ 
  post: BlogPost; 
  formatNumber: (num: number) => string;
  onDelete: (id: string, title: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}> = React.memo(({
  post,
  formatNumber,
  onDelete,
  onView,
  onEdit,
}) => {
  const statusColors = {
    published: 'bg-green-500/20 text-green-300',
    draft: 'bg-yellow-500/20 text-yellow-300',
  };

  // Use imageUrl or image_url from API
  const imageUrl = post.imageUrl || (post as any).image_url;

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(post.id, post.title);
  }, [post.id, post.title, onDelete]);

  const handleView = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onView(post.id);
  }, [post.id, onView]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(post.id);
  }, [post.id, onEdit]);

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl overflow-hidden hover:border-[#e60a15]/30 transition-all">
      {imageUrl && (
        <div className="h-40 overflow-hidden relative">
          <img
            src={imageUrl}
            alt={post.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Crect fill="%23e60a15" width="400" height="200"/%3E%3C/svg%3E';
            }}
          />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-bold text-white flex-1 pr-2 line-clamp-2">{post.title}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusColors[post.status]}`}>
            {post.status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">{post.excerpt}</p>
        <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
          <span>👁 {formatNumber(post.views)}</span>
          <span>❤️ {formatNumber(post.likes)}</span>
          <span>💬 {formatNumber(post.comments)}</span>
        </div>
        <div className="flex gap-2">
          {post.status === 'draft' ? (
            <button
              onClick={handleEdit}
              className="flex-1 px-3 py-2 bg-[#e60a15] hover:bg-[#d10a14] text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
          ) : (
            <button
              onClick={handleView}
              className="flex-1 px-3 py-2 bg-[#e60a15] hover:bg-[#d10a14] text-white text-xs font-semibold rounded-lg transition-colors"
            >
              View Blog
            </button>
          )}
          <button
            onClick={handleDelete}
            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold rounded-lg transition-colors"
            title="Delete blog post"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
BlogCard.displayName = 'BlogCard';

const formatNumberCompact = (value: number): string => {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
};

const useLastUpdatedLabel = (deps: React.DependencyList) => {
  const [timestamp, setTimestamp] = useState(() => Date.now());
  useEffect(() => {
    setTimestamp(Date.now());
  }, deps);

  return useMemo(
    () =>
      new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
    [timestamp]
  );
};

interface ViewData {
  date: string;
  views: number;
}

// Views Over Time Chart Component (animated line)
const ViewsOverTimeChart = React.memo(({ data }: { data: ViewData[] }) => {
  const lastUpdated = useLastUpdatedLabel([data]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col" style={{ aspectRatio: '1/1' }}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
          <h4 className="text-lg font-bold text-white">Views Over Time</h4>
          <span className="text-xs text-gray-500 whitespace-nowrap">Awaiting data…</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-base">
          No data available
        </div>
      </div>
    );
  }

  const processed = useMemo(() => {
    const values = data.map((entry) => entry.views);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = Math.max(max - min, 1);
    const width = 420;
    const height = 220;
    const paddingX = 36;
    const paddingY = 30;

    const coordinates = data.map((entry, index) => {
      const ratio = data.length > 1 ? index / (data.length - 1) : 0.5;
      const x = paddingX + ratio * (width - paddingX * 2);
      const normalized = (entry.views - min) / range;
      const y = paddingY + (1 - normalized) * (height - paddingY * 2);
      return { x, y, label: entry.date, value: entry.views };
    });

    return {
      width,
      height,
      paddingX,
      paddingY,
      coordinates,
      max,
      min,
      range
    };
  }, [data]);

  const gradientId = useMemo(() => `line-gradient-${Math.random().toString(36).slice(2, 9)}`, []);

  const linePath = useMemo(() => {
    if (processed.coordinates.length === 0) return '';
    if (processed.coordinates.length === 1) {
      const point = processed.coordinates[0];
      return `M ${point.x} ${point.y}`;
    }
    return processed.coordinates
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }, [processed.coordinates]);

  const areaPath = useMemo(() => {
    if (processed.coordinates.length === 0) return '';
    const baseY = processed.height - processed.paddingY;
    const startPoint = processed.coordinates[0];
    const pathSegments = processed.coordinates
      .map((point, index) => `${index === 0 ? 'L' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
    const endPoint = processed.coordinates[processed.coordinates.length - 1];
    return `M ${startPoint.x} ${baseY} ${pathSegments} L ${endPoint.x} ${baseY} Z`;
  }, [processed.coordinates, processed.height, processed.paddingY]);

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col overflow-hidden w-full" style={{ aspectRatio: '1/1' }}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
        <h4 className="text-lg font-bold text-white">Views Over Time</h4>
        <span className="text-xs text-gray-500 whitespace-nowrap">Updated {lastUpdated}</span>
      </div>
      <div className="flex-1 relative w-full">
        <div className="absolute inset-0 p-2 w-full h-full">
        <svg
          className="w-full h-full block"
          viewBox={`0 0 ${processed.width} ${processed.height}`}
          preserveAspectRatio="none"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e60a15" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#e60a15" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={areaPath}
            fill={`url(#${gradientId})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
          <motion.path
            d={linePath}
            fill="none"
            stroke="#ff6b6b"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
          />
          {processed.coordinates.map((point, index) => (
            <motion.circle
              key={`${point.label}-${index}`}
              cx={point.x}
              cy={point.y}
              r={6}
              fill="#ff6b6b"
              opacity={0.75}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 + index * 0.05, type: 'spring', stiffness: 220, damping: 12 }}
            />
          ))}
        </svg>
        </div>
        <div className="absolute inset-0 pointer-events-none w-full h-full">
          <div className="absolute top-4 left-5 text-sm font-medium text-gray-400">
            Peak: <span className="text-white font-bold">{formatNumberCompact(processed.max)}</span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs text-gray-500">
            {processed.coordinates.map((point, index) => {
              const segments = point.label.split(' ');
              const label = segments[segments.length - 1] ?? point.label;
              return (
                <span key={`${point.label}-${index}`} className="flex-1 text-center" style={{ fontSize: '11px' }}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
ViewsOverTimeChart.displayName = 'ViewsOverTimeChart';

// Engagement Per Day Chart Component (animated bars)
const EngagementByWeekChart = React.memo(({ data }: { data: EngagementData[] }) => {
  const lastUpdated = useLastUpdatedLabel([data]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col" style={{ aspectRatio: '1/1' }}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
          <h4 className="text-lg font-bold text-white">Engagement Per Day</h4>
          <span className="text-xs text-gray-500 whitespace-nowrap">Awaiting data…</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-base">
          No data available
        </div>
      </div>
    );
  }

  const processed = useMemo(() => {
    const normalized = data.map((entry) => ({
      label: entry.week,
      value: Math.max(0, entry.raw_engagement ?? entry.engagement ?? 0),
      percent: Math.max(1, entry.engagement ?? 0)
    }));
    const maxValue = Math.max(...normalized.map((entry) => entry.value), 1);
    
    return { normalized, maxValue };
  }, [data]);

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col overflow-hidden w-full" style={{ aspectRatio: '1/1' }}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
        <h4 className="text-lg font-bold text-white">Engagement Per Day</h4>
        <span className="text-xs text-gray-500 whitespace-nowrap">Updated {lastUpdated}</span>
      </div>
      <div className="flex-1 flex flex-col w-full min-w-0">
        <div className="flex-1 relative pt-6 pb-12 w-full">
          <div className="h-full w-full flex items-end gap-2.5 px-2">
          {processed.normalized.map((entry, index) => {
            const heightPercent = Math.min(100, Math.max(15, (entry.value / processed.maxValue) * 100));
            return (
              <div key={`${entry.label}-${index}`} className="relative flex-1 group min-w-0">
                <motion.div
                  className="w-full rounded-t-md bg-gradient-to-t from-[#e60a15] to-[#ff3344] min-h-[20px]"
                  initial={{ height: 0 }}
                  animate={{ height: `${heightPercent}%` }}
                  transition={{ type: 'spring', stiffness: 180, damping: 22, delay: index * 0.05 }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-black/90 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {formatNumberCompact(entry.value)}
                </div>
                <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-gray-400 whitespace-nowrap" style={{ fontSize: '11px' }}>
                  {entry.label}
                </span>
              </div>
            );
          })}
          </div>
        </div>
        <div className="mt-4 w-full grid grid-cols-2 gap-4 text-sm font-medium text-gray-400 flex-shrink-0">
          <p className="truncate">
            Peak: <span className="text-white font-bold">{formatNumberCompact(processed.maxValue)}</span>
          </p>
          <p className="text-right truncate">
            Avg: <span className="text-white font-bold">
              {formatNumberCompact(
                processed.normalized.reduce((sum, item) => sum + item.value, 0) / processed.normalized.length
              )}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
});
EngagementByWeekChart.displayName = 'EngagementByWeekChart';

// Top Categories Chart Component (animated pie)
const TopCategoriesChart = React.memo(({ data }: { data: CategoryData[] }) => {
  const lastUpdated = useLastUpdatedLabel([data]);

  const validData = useMemo(
    () => (data ? data.filter((entry) => entry && entry.name && typeof entry.value === 'number' && entry.value >= 0) : []),
    [data]
  );

  if (validData.length === 0) {
    return (
      <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col" style={{ aspectRatio: '1/1' }}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
          <h4 className="text-lg font-bold text-white">Top Categories</h4>
          <span className="text-xs text-gray-500 whitespace-nowrap">Awaiting data…</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-base">
          No data available
        </div>
      </div>
    );
  }

  const resolvedData = useMemo(() => {
    if (!validData.length) return [];
    
    // Check if we have positive values
    const hasPositive = validData.some((entry) => entry.value > 0);
    if (hasPositive) {
      return validData;
    }

    // Try to calculate from count
    const totalCount = validData.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
    if (totalCount > 0) {
      let accumulated = 0;
      const adjusted = validData.map((entry) => {
        const percent = Math.max(1, Math.round(((entry.count ?? 0) / totalCount) * 100));
        accumulated += percent;
        return { ...entry, value: percent };
      });
      const diff = accumulated - 100;
      if (diff !== 0 && adjusted.length > 0) {
        adjusted[0] = { ...adjusted[0], value: Math.max(1, adjusted[0].value - diff) };
      }
      return adjusted;
    }

    // Fallback to equal distribution
    const equalShare = Math.max(1, Math.floor(100 / validData.length));
    const adjusted = validData.map((entry) => ({ ...entry, value: equalShare }));
    const remainder = 100 - adjusted.reduce((sum, entry) => sum + entry.value, 0);
    if (remainder !== 0 && adjusted.length > 0) {
      adjusted[0] = { ...adjusted[0], value: Math.max(1, adjusted[0].value + remainder) };
    }
    return adjusted;
  }, [validData]);

  const segments = useMemo(() => {
    const total = resolvedData.reduce((sum, segment) => sum + segment.value, 0);
    if (total === 0) {
      return resolvedData.map((segment, index) => ({
        ...segment,
        startAngle: (index / resolvedData.length) * 360,
        endAngle: ((index + 1) / resolvedData.length) * 360
      }));
    }
    let currentAngle = -90; // start at top
    return resolvedData.map((segment) => {
      const angle = (segment.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      return { ...segment, startAngle, endAngle };
    });
  }, [resolvedData]);

  const describeArc = (startAngle: number, endAngle: number, radius: number) => {
    const polarToCartesian = (angleDeg: number) => {
      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: radius + radius * Math.cos(angleRad),
        y: radius + radius * Math.sin(angleRad)
      };
    };

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    const start = polarToCartesian(endAngle);
    const end = polarToCartesian(startAngle);

    return `M ${radius} ${radius} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
  };

  const totalInteractions = resolvedData.reduce((sum, segment) => sum + (segment.engagement ?? 0), 0);
  const topSegment = resolvedData.reduce(
    (best, current) => (current.value > (best?.value ?? 0) ? current : best),
    resolvedData[0]
  );

  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded-3xl p-6 flex flex-col overflow-hidden w-full" style={{ aspectRatio: '1/1' }}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-shrink-0">
        <h4 className="text-lg font-bold text-white">Top Categories</h4>
        <span className="text-xs text-gray-500 whitespace-nowrap">Updated {lastUpdated}</span>
      </div>
      <div className="flex-1 flex items-center justify-center w-full min-w-0">
        <div className="w-full h-full flex flex-col gap-4 items-center justify-center px-2">
          <div className="relative flex-shrink-0 w-40 h-40 sm:w-48 sm:h-48">
          <svg viewBox="0 0 120 120" className="block w-full h-full overflow-visible">
            {segments.map((segment, index) => (
              <motion.path
                key={`${segment.name}-${index}`}
                d={describeArc(segment.startAngle, segment.endAngle, 60)}
                fill={segment.color || '#e60a15'}
                stroke="rgba(0,0,0,0.3)"
                strokeWidth="0.5"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.08, type: 'spring', stiffness: 180, damping: 18 }}
              />
            ))}
          </svg>
          {topSegment && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white pointer-events-none px-4">
              <span className="text-xs uppercase tracking-wider text-gray-400 mb-1">Top</span>
              <span className="text-base font-bold leading-tight mb-1" style={{ maxWidth: '160px', wordWrap: 'break-word' }}>{topSegment.name}</span>
              <span className="text-sm text-gray-400">
                {formatNumberCompact(topSegment.count ?? topSegment.engagement ?? 0)}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2.5 min-w-0 w-full overflow-y-auto custom-scrollbar" style={{ maxHeight: '100%' }}>
          {resolvedData.slice(0, 5).map((segment, index) => (
            <div key={`${segment.name}-${index}`} className="flex items-start gap-3">
              <span
                className="mt-1.5 w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: segment.color || '#e60a15' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-gray-200 mb-1">
                  <span className="text-white">{segment.name}</span>
                  <span className="text-gray-400 font-bold flex-shrink-0">{segment.value}%</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-gray-500">
                  {segment.count !== undefined && (
                    <span className="whitespace-nowrap">{segment.count} posts</span>
                  )}
                  {segment.engagement !== undefined && (
                    <span className="whitespace-nowrap">{formatNumberCompact(segment.engagement)} int.</span>
                  )}
                  {segment.views !== undefined && (
                    <span className="whitespace-nowrap">{formatNumberCompact(segment.views)} views</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="pt-3 mt-1 border-t border-white/10 text-sm font-medium text-gray-400">
            Total: <span className="text-white font-bold">
              {formatNumberCompact(totalInteractions || resolvedData.reduce((sum, entry) => sum + entry.value, 0))}
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
});
TopCategoriesChart.displayName = 'TopCategoriesChart';

// Topic Suggestion Card Component
const TopicSuggestionCard: React.FC<{ 
  title: string; 
  reason: string;
  onGenerateOutline: (topic: string) => void;
}> = React.memo(({ title, reason, onGenerateOutline }) => {
  // Format reason text - handle line breaks and special characters
  const formatReason = (text: string): React.ReactNode => {
    if (!text) return '';
    
    // Remove markdown formatting
    let formatted = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1');
    
    // Split by newlines and render with breaks
    const lines = formatted.split('\n').filter(line => line.trim());
    
    return lines.map((line, index) => (
      <React.Fragment key={index}>
        {line.trim()}
        {index < lines.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  const handleClick = useCallback(() => {
    onGenerateOutline(title);
  }, [title, onGenerateOutline]);

  return (
    <div className="border-l-2 border-[#e60a15] pl-3 sm:pl-4 py-2 sm:py-2.5 mb-2 sm:mb-3 last:mb-0">
      <h4 className="text-sm sm:text-base font-semibold text-white mb-1.5 sm:mb-2 line-clamp-2 break-words">
        {title}
      </h4>
      <div className="text-xs sm:text-sm text-gray-400 mb-2 sm:mb-2.5 line-clamp-3 break-words leading-relaxed">
        {formatReason(reason)}
      </div>
      <button 
        onClick={handleClick}
        className="text-xs sm:text-sm font-medium text-[#e60a15] hover:text-[#d10a14] transition-colors"
      >
        Generate Outline
      </button>
    </div>
  );
});
TopicSuggestionCard.displayName = 'TopicSuggestionCard';

export default BlogPage;
