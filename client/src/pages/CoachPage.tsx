import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoIcon from '../assets/images/logo-icon.svg';
import { API_ENDPOINTS } from '../config/api';
import { ChatHistoryService, type ChatSession, type ChatMessage as HistoryChatMessage } from '../services/chatHistoryService';

// Component to format text with comprehensive markdown-like styling
const FormattedText: React.FC<{ content: string }> = ({ content }) => {
  const formatText = (text: string) => {
    let formattedText = text;
    
    // Handle bold text: **text** or __text__
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
    formattedText = formattedText.replace(/__(.*?)__/g, '<strong class="font-semibold text-white">$1</strong>');
    
    // Handle italic text: *text* or _text_
    formattedText = formattedText.replace(/\*(.*?)\*/g, '<em class="italic text-white/90">$1</em>');
    formattedText = formattedText.replace(/_(.*?)_/g, '<em class="italic text-white/90">$1</em>');
    
    // Handle code blocks: ```code```
    formattedText = formattedText.replace(/```([\s\S]*?)```/g, 
      '<div class="bg-black/30 border border-white/20 rounded-lg p-3 my-2 font-mono text-sm overflow-x-auto"><code class="text-green-400">$1</code></div>');
    
    // Handle inline code: `code`
    formattedText = formattedText.replace(/`([^`]+)`/g, 
      '<code class="bg-black/20 px-1.5 py-0.5 rounded text-sm font-mono text-green-300">$1</code>');
    
    // Split by lines for list processing
    const lines = formattedText.split('\n');
    const processedLines = lines.map((line, index) => {
      const trimmedLine = line.trim();
      
      // Handle headers: # ## ###
      if (trimmedLine.startsWith('### ')) {
        return `<h3 class="text-lg font-bold text-white mt-4 mb-2">${trimmedLine.substring(4)}</h3>`;
      } else if (trimmedLine.startsWith('## ')) {
        return `<h2 class="text-xl font-bold text-white mt-4 mb-2">${trimmedLine.substring(3)}</h2>`;
      } else if (trimmedLine.startsWith('# ')) {
        return `<h1 class="text-2xl font-bold text-white mt-4 mb-2">${trimmedLine.substring(2)}</h1>`;
      }
      
      // Handle bullet points: - or • or *
      if (trimmedLine.match(/^[-•*]\s/)) {
        return `<div class="flex items-start ml-4 mb-1"><span class="text-[#EB4747] mr-2 mt-1">•</span><span class="flex-1">${trimmedLine.substring(2)}</span></div>`;
      }
      
      // Handle numbered lists: 1. 2. etc.
      if (trimmedLine.match(/^\d+\.\s/)) {
        const match = trimmedLine.match(/^(\d+)\.\s(.*)$/);
        if (match) {
          return `<div class="flex items-start ml-4 mb-1"><span class="text-[#EB4747] mr-2 font-semibold">${match[1]}.</span><span class="flex-1">${match[2]}</span></div>`;
        }
      }
      
      // Handle empty lines
      if (trimmedLine === '') {
        return '<div class="mb-2"></div>';
      }
      
      // Regular paragraphs
      return `<div class="mb-2">${line}</div>`;
    });
    
    return processedLines.join('');
  };

  return (
    <div 
      className="text-white/90 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: formatText(content) }}
    />
  );
};

const suggestedPrompts = [
  {
    text: "What's the best workout for weight loss?",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6.5 6.5h11l-1 7-4 1-4-1-1-7z" />
        <path d="M6.5 6.5L12 2l5.5 4.5" />
        <path d="M12 13.5v8" />
      </svg>
    ),
    gradient: "from-orange-500 to-red-500"
  },
  {
    text: 'How can I improve my running endurance?',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    text: 'Create a 7-day workout plan for beginners',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    gradient: "from-green-500 to-emerald-500"
  }
];

interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  isError?: boolean;
  fileData?: {
    name: string;
    type: string;
    url: string;
  };
}

const CoachPage: React.FC = () => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Chat history state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat history on component mount
  useEffect(() => {
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    try {
      setLoadingHistory(true);
      console.log('Loading chat history...');
      const response = await ChatHistoryService.getChatHistory(1, 20, searchTerm);
      console.log('Chat history response:', response);
      setChatSessions(response.sessions);
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewChat = async () => {
    try {
      // Clear current messages and session
      setMessages([]);
      setCurrentSession(null);
      setMessage('');
      clearSelectedFile();
    } catch (error) {
      console.error('Failed to start new chat:', error);
    }
  };

  const loadChatSession = async (session: ChatSession) => {
    try {
      setIsLoadingSession(true);
      console.log('Loading chat session:', session.id, session.title);
      const response = await ChatHistoryService.getSessionMessages(session.id);
      console.log('Session response:', response);
      
      // Convert history messages to local format
      const convertedMessages: ChatMessage[] = response.messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        isUser: msg.is_user,
        timestamp: new Date(msg.timestamp),
        isError: false,
        fileData: msg.file_data
      }));

      console.log('Converted messages:', convertedMessages);

      // Check for duplicates before setting messages
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const uniqueNewMessages = convertedMessages.filter(msg => !existingIds.has(msg.id));

        if (uniqueNewMessages.length !== convertedMessages.length) {
          console.warn('Found duplicate message IDs when loading session, filtering them out');
        }

        return [...prev, ...uniqueNewMessages];
      });
      setCurrentSession(session);
    } catch (error) {
      console.error('Failed to load chat session:', error);
      addMessage('Failed to load chat session. Please try again.', false, true);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const deleteChatSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat?')) return;
    
    try {
      await ChatHistoryService.deleteSession(sessionId);
      setChatSessions(prev => prev.filter(s => s.id !== sessionId));
      
      // If current session was deleted, start new chat
      if (currentSession?.id === sessionId) {
        startNewChat();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleUsePrompt = (text: string) => {
    setMessage(text);
  };

  const addMessage = (content: string, isUser: boolean, isError: boolean = false, fileData?: {name: string, type: string, url: string}) => {
    // Generate unique ID using timestamp + random component to avoid collisions
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newMessage: ChatMessage = {
      id: uniqueId,
      content,
      isUser,
      timestamp: new Date(),
      isError,
      fileData
    };

    // Check for duplicates before adding
    setMessages(prev => {
      // Check if message with same ID already exists
      const existingMessage = prev.find(msg => msg.id === uniqueId);
      if (existingMessage) {
        console.warn('Attempted to add duplicate message with ID:', uniqueId);
        return prev;
      }
      return [...prev, newMessage];
    });
  };

  const handleSend = async () => {
    if (!message.trim() && !selectedFile) return;
    
    // Create user message display text and file data
    let userMessage = '';
    let fileData: {name: string, type: string, url: string} | undefined = undefined;
    
    if (selectedFile && persistentBlobUrls.has(selectedFile.name)) {
      fileData = {
        name: selectedFile.name,
        type: selectedFile.type,
        url: persistentBlobUrls.get(selectedFile.name)!
      };
    }
    
    if (message.trim() && selectedFile) {
      // Both text and file
      const fileType = selectedFile.type.startsWith('image/') ? 'Image' : 
                      selectedFile.type.startsWith('audio/') ? 'Audio' : 'File';
      userMessage = `${message.trim()}\n\n📎 ${fileType}: ${selectedFile.name}`;
    } else if (message.trim()) {
      // Text only
      userMessage = message.trim();
    } else if (selectedFile) {
      // File only
      const fileType = selectedFile.type.startsWith('image/') ? 'Image' : 
                      selectedFile.type.startsWith('audio/') ? 'Audio' : 'File';
      userMessage = `📎 ${fileType}: ${selectedFile.name}`;
    }
    
    addMessage(userMessage, true, false, fileData);
    
    setLoading(true);
    const currentMessage = message.trim();
    const currentFile = selectedFile;
    setMessage('');
    clearSelectedFile();
    
    try {
      // Determine mode based on file type
      const mode = currentFile?.type.startsWith('image/') ? 'image' : 
                   currentFile?.type.startsWith('audio/') ? 'voice' : 'text';
      
      const res = await ChatHistoryService.sendMessage({ 
        message: currentMessage, 
        mode: mode as any,
        file: currentFile,
        sessionId: currentSession?.id
      });
      
      if (res.error) {
        addMessage(res.error, false, true);
      } else if (res.reply) {
        // Show transcription feedback for voice messages
        if (mode === 'voice' && res.transcription) {
          const transcriptionFeedback = `I heard: "${res.transcription}"${res.transcription_confidence === 'medium' ? ' (Please speak more clearly for better accuracy)' : ''}`;
          addMessage(transcriptionFeedback, false);
        }
        addMessage(res.reply, false);
        
        // Update current session if we got a session_id back (new session created)
        if (res.session_id && !currentSession) {
          console.log('New session created:', res.session_id);
          // Reload chat history to get the new session
          loadChatHistory();
          // Set current session
          const newSession: ChatSession = {
            id: res.session_id,
            user_id: '',
            title: currentMessage.length > 30 ? currentMessage.substring(0, 30) + '...' : currentMessage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            message_count: 2,
            last_message: currentMessage,
            last_message_time: new Date().toISOString()
          };
          setCurrentSession(newSession);
          console.log('Set new current session:', newSession);
        }
      }
    } catch (e) {
      addMessage('Something went wrong. Please try again.', false, true);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    // Reset the input value to allow selecting the same file again
    if (event.target) {
      event.target.value = '';
    }
  };

  // Store persistent blob URLs for chat messages (won't be revoked until unmount)
  const [persistentBlobUrls, setPersistentBlobUrls] = useState<Map<string, string>>(new Map());

  // Function to clear selected file and reset input
  const clearSelectedFile = () => {
    // Don't revoke blob URL here - keep it for chat messages
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Create and manage blob URLs
  useEffect(() => {
    if (selectedFile) {
      // Create new blob URL and store it persistently
      const newBlobUrl = URL.createObjectURL(selectedFile);
      setPersistentBlobUrls(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedFile.name, newBlobUrl);
        return newMap;
      });
    }
  }, [selectedFile]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Revoke all persistent blob URLs on unmount
      persistentBlobUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [persistentBlobUrls]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      
      const recorder = new MediaRecorder(stream);
      const audioChunks: BlobPart[] = [];
      
      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        setSelectedFile(audioFile);
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        setMediaRecorder(null);
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      
      // Stop recording after 10 seconds max
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 10000);
      
    } catch (error) {
      addMessage('Microphone access denied. Please allow microphone access to use voice recording.', false, true);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [onboardingStep1, setOnboardingStep1] = useState<any>(null);

  // Load user and onboarding data
  useEffect(() => {
    const storedUser = (() => {
      try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();
    if (storedUser) {
      setUser(storedUser);
    }
    
    // Load onboarding data for form users to get profile picture
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

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('onboarding_completed');
    localStorage.removeItem('onboarding_step1');
    localStorage.removeItem('onboarding_step2');
    localStorage.removeItem('onboarding_data');
    navigate('/');
  };

  // Sidebar state (collapsible)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('coach_sidebar_collapsed');
      return raw ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('coach_sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className="min-h-screen bg-[#121212] text-white font-['Manrope']">
      {/* Header (same as Dashboard) */}
      <header className="w-full h-[73px] bg-[#121212] border-b border-white/10 backdrop-blur-sm fixed top-0 left-0 right-0 z-40">
        <div className="max-w-[1920px] mx-auto px-10 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoIcon} alt="FluxWell" className="w-8 h-8" />
            <h2 className="text-2xl font-bold font-['Lexend'] tracking-tight">
              <span className="text-white">Flux</span>
              <span className="text-[#EB4747]">Well</span>
            </h2>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link>
            <Link to="/workouts" className="text-gray-400 hover:text-white">Workouts</Link>
            <Link to="/nutrition" className="text-gray-400 hover:text-white">Nutrition</Link>
            <Link to="/realtime" className="text-gray-400 hover:text-white">Tracking</Link>
            <Link to="/coach" className="text-[#EB4747] font-semibold">Coach</Link>
            <Link to="/progress" className="text-gray-400 hover:text-white">Progress</Link>
            <Link to="/blog" className="text-gray-400 hover:text-white">Blog</Link>
            <Link to="/practice" className="text-gray-400 hover:text-white">Practice Room</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="hidden sm:inline px-3 py-2 rounded-lg border border-white/20 text-xs text-gray-300 hover:bg-white/10">Logout</button>
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center border border-white/10">
              {(() => {
                const provider = (user as any)?.auth_provider;
                const socialPic = (provider === 'google' || provider === 'fitbit') ? ((user as any)?.profile_picture_url || null) : null;
                const formPic = provider === 'form' ? (onboardingStep1 as any)?.profile_picture_url || null : null;
                const src = socialPic || formPic;
                if (src) return <img src={src} alt={(user as any)?.full_name || 'Profile'} className="w-full h-full object-cover" />;
                return <span className="text-sm font-semibold">{(user as any)?.full_name?.[0] || 'U'}</span>;
              })()}
            </div>
          </div>
        </div>
      </header>

      {/* Gradient background layer */}
      <div className="fixed inset-0 -z-10" aria-hidden>
        <div className="w-full h-full" style={{
          background: 'linear-gradient(159deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 50%, rgba(71,36,38,0.5) 100%)'
        }} />
      </div>

      {/* Sidebar */}
      <aside
        className="fixed top-[73px] left-0 bottom-0 z-30 backdrop-blur-xl"
        style={{ width: isSidebarCollapsed ? 80 : 300 }}
        aria-label="Chat sidebar"
      >
        <div className="h-full flex flex-col border-r border-white/10 bg-[rgba(17,17,17,0.55)]/50">
          {/* Sidebar header with toggle */}
          <div className="h-16 px-3 flex items-center justify-between border-b border-white/10">
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#EB4747] to-[#7c1e1e] shadow-[0_0_0_3px_rgba(235,71,71,0.15)]" />
                <span className="text-sm font-semibold text-gray-100 tracking-wide">Coach</span>
              </div>
            )}
            <button
              onClick={() => setIsSidebarCollapsed((v) => !v)}
              className="w-9 h-9 grid place-items-center rounded-xl hover:bg-white/10 text-gray-300 transition-colors"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                {isSidebarCollapsed ? (
                  <path d="M9 18l6-6-6-6" />
                ) : (
                  <path d="M15 18l-6-6 6-6" />
                )}
              </svg>
            </button>
          </div>

          {/* New Chat button */}
          <div className="p-3 border-b border-white/10">
            <button
              className={`w-full h-11 rounded-xl bg-gradient-to-r from-[#EB4747] to-[#b83232] hover:from-[#d13f3f] hover:to-[#9e2b2b] text-white font-semibold text-sm shadow-[0_10px_25px_-5px_rgba(235,71,71,0.45)] transition-all ${isSidebarCollapsed ? 'grid place-items-center' : 'px-3'} `}
              title="New Chat"
              onClick={startNewChat}
            >
              {isSidebarCollapsed ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              ) : (
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  New Chat
                </span>
              )}
            </button>
          </div>

          {/* Search */}
          {!isSidebarCollapsed && (
            <div className="p-3 border-b border-white/10">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && loadChatHistory()}
                  className="w-full h-9 pl-9 pr-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#EB4747]/50"
                />
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          )}

          {/* History */}
          <div
            className="flex-1 overflow-auto"
            style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}
          >
            {!isSidebarCollapsed && (
              <div className="px-3 pt-3 pb-2 text-[11px] tracking-widest text-gray-400">
                RECENT CHATS
                {loadingHistory && (
                  <div className="inline-block ml-2 w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin"></div>
                )}
              </div>
            )}
            <ul className="px-2 space-y-1.5">
              {chatSessions.map((session) => {
                const isActive = currentSession?.id === session.id;
                const timeAgo = new Date(session.updated_at).toLocaleDateString() === new Date().toLocaleDateString() 
                  ? new Date(session.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : new Date(session.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
                
                return (
                  <li key={session.id} className="relative group">
                    <button
                      className={`group w-full rounded-xl transition-colors ${
                        isSidebarCollapsed
                          ? 'h-11 grid place-items-center'
                          : 'px-3 py-2.5 hover:bg-white/8'
                      } ${isActive ? 'bg-[#EB4747]/20 border border-[#EB4747]/30' : ''}`}
                      title={session.title}
                      onClick={() => loadChatSession(session)}
                      disabled={isLoadingSession}
                    >
                      {isSidebarCollapsed ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={`w-5 h-5 ${isActive ? 'text-[#EB4747]' : 'text-gray-300'}`} fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                        </svg>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg grid place-items-center ${isActive ? 'bg-[#EB4747]/20 text-[#EB4747]' : 'bg-white/5 text-gray-300'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm truncate ${isActive ? 'text-white font-medium' : 'text-gray-100'}`}>
                              {session.title}
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-1">
                              <span>{timeAgo}</span>
                              {session.message_count > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{session.message_count} messages</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Delete button positioned absolutely */}
                    {!isSidebarCollapsed && (
                      <button
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-md hover:bg-red-500/20 hover:text-red-400 grid place-items-center cursor-pointer transition-colors z-10"
                        aria-label="Delete chat"
                        title="Delete chat"
                        onClick={(e) => deleteChatSession(session.id, e)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </li>
                );
              })}
              
              {!loadingHistory && chatSessions.length === 0 && !isSidebarCollapsed && (
                <li className="px-3 py-4 text-center text-sm text-gray-400">
                  No chat history yet.<br />
                  Start a new conversation!
                </li>
              )}
            </ul>
          </div>

          {/* Bottom action bar */}
          <div className="p-3 border-t border-white/10 flex items-center justify-between">
            {isSidebarCollapsed ? (
              <button className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 grid place-items-center" title="Command Palette">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </button>
            ) : (
              <button className="h-10 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-200">⌘K Command Palette</button>
            )}
          </div>
        </div>
      </aside>

      <main
        className="fixed top-[73px] bottom-0 right-0 transition-all duration-300"
        style={{ left: isSidebarCollapsed ? 80 : 300 }}
      >
        <div className="h-full flex flex-col">
          {/* Welcome message when no messages - with proper spacing */}
          {!isLoadingSession && messages.length === 0 && (
            <div className="flex-1 flex flex-col px-6 py-8 min-h-0">
              {/* Scrollable content area to prevent overflow */}
              <div className="flex-1 flex flex-col justify-center max-h-full overflow-y-auto">
                {/* Hero copy */}
                <div className="text-center mb-8 flex-shrink-0">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">Welcome to Fluxie</h1>
                  <p className="text-white/70 text-lg">I'm your AI fitness coach. Let's get started!</p>
                </div>

                {/* Suggested prompts - scrollable if needed */}
                <div className="max-w-4xl mx-auto w-full flex-shrink-0">
                  <h2 className="text-md font-semibold text-center mb-6 text-white/90">Suggested Prompts:</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {suggestedPrompts.map((prompt, index) => (
                      <button
                        key={prompt.text}
                        onClick={() => handleUsePrompt(prompt.text)}
                        className="group relative p-4 lg:p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/5 backdrop-blur-sm"
                      >
                        {/* Gradient background on hover */}
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${prompt.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                        
                        {/* Content */}
                        <div className="relative z-10 flex flex-col items-center text-center space-y-3">
                          {/* Icon with gradient background */}
                          <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br ${prompt.gradient} flex items-center justify-center text-white shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
                            {prompt.icon}
                          </div>
                          
                          {/* Text */}
                          <p className="text-sm font-medium text-white/90 group-hover:text-white transition-colors duration-300 leading-relaxed">
                            {prompt.text}
                          </p>
                          
                          {/* Subtle arrow indicator */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading state for session switch */}
          {isLoadingSession && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white/60">Loading chat...</p>
              </div>
            </div>
          )}

          {/* Chat messages area */}
          {!isLoadingSession && messages.length > 0 && (
            <div className="flex-1 overflow-y-auto p-4 pb-2">
              <div className="max-w-4xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.isUser 
                        ? 'bg-[#EB4747] text-white' 
                        : msg.isError 
                          ? 'bg-red-900/30 border border-red-500/30 text-red-200'
                          : 'bg-white/10 border border-white/10 text-white'
                    }`}>
                      {msg.isUser ? (
                        <div>
                          <p className="text-sm">{msg.content}</p>
                          {/* File preview for user messages */}
                          {msg.fileData && (
                            <div className="mt-2">
                              {msg.fileData.type.startsWith('image/') && (
                                <img 
                                  src={msg.fileData.url} 
                                  alt="Shared image" 
                                  className="max-w-full max-h-32 rounded-lg border border-white/20 object-contain"
                                />
                              )}
                              {msg.fileData.type.startsWith('audio/') && (
                                <audio 
                                  controls 
                                  className="w-full max-w-sm mt-1"
                                  style={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    outline: 'none'
                                  }}
                                >
                                  <source src={msg.fileData.url} type={msg.fileData.type} />
                                  Your browser does not support the audio element.
                                </audio>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm">
                          <FormattedText content={msg.content} />
                        </div>
                      )}
                      <div className={`text-xs mt-2 opacity-70 ${msg.isUser ? 'text-white/80' : 'text-white/60'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-3 bg-white/10 border border-white/10">
                      <div className="flex items-center space-x-2">
                        <div className="animate-pulse flex space-x-1">
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-xs text-white/60">Fluxie is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Fixed Input area - optimized for all screen sizes and file previews */}
          <div className="flex-shrink-0 border-t border-white/10 bg-[#121212]/80 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto p-4">
              {/* File preview - compact and elegant */}
              {selectedFile && (
                <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    {/* File info and preview in a compact layout */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#EB4747] to-[#d13f3f] flex items-center justify-center text-xs font-medium">
                          {selectedFile.type.startsWith('image/') ? '🖼️' : selectedFile.type.startsWith('audio/') ? '🎵' : '📎'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/90 truncate font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-white/60">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      
                      {/* Compact Image Preview */}
                      {selectedFile.type.startsWith('image/') && persistentBlobUrls.has(selectedFile.name) && (
                        <div className="relative">
                          <img
                            src={persistentBlobUrls.get(selectedFile.name)}
                            alt="Preview"
                            className="w-full max-h-24 rounded-lg border border-white/10 object-cover cursor-pointer hover:opacity-90 transition-all duration-200 hover:scale-[1.02]"
                            onClick={() => {
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <html>
                                    <head><title>${selectedFile.name}</title></head>
                                    <body style="margin:0;padding:20px;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;">
                                      <img src="${persistentBlobUrls.get(selectedFile.name)}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                    </body>
                                  </html>
                                `);
                              }
                            }}
                            title="Click to view full size"
                          />
                          <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                        </div>
                      )}

                      {/* Compact Audio Preview */}
                      {selectedFile.type.startsWith('audio/') && persistentBlobUrls.has(selectedFile.name) && (
                        <div className="mt-2">
                          <audio
                            controls
                            className="w-full h-8"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: '8px',
                              outline: 'none'
                            }}
                          >
                            <source src={persistentBlobUrls.get(selectedFile.name)} type={selectedFile.type} />
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      )}
                    </div>
                    
                    {/* Remove button - always visible and accessible */}
                    <button 
                      onClick={clearSelectedFile}
                      className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-400 transition-all duration-200 flex items-center justify-center group"
                      title="Remove file"
                    >
                      <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Enhanced Input Controls with better UX */}
              <div className="flex items-end gap-3">
                {/* Text Input Area - expandable */}
                <div className="flex-1 min-w-0">
                  <div className="min-h-12 rounded-xl bg-white/5 backdrop-blur border border-white/10 hover:border-white/20 focus-within:border-[#EB4747]/50 transition-all duration-200 flex items-center px-4 py-3">
                    <textarea
                      placeholder="Type your message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      className="flex-1 bg-transparent outline-none text-white placeholder-white/50 min-w-0 resize-none min-h-6 max-h-32 overflow-y-auto"
                      disabled={loading}
                      rows={1}
                      style={{
                        height: 'auto',
                        lineHeight: '1.5rem'
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                      }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {/* File input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    accept="image/*,audio/*"
                    className="hidden"
                    id="file-input"
                  />

                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-12 h-12 rounded-xl grid place-items-center bg-white/5 border border-white/10 hover:bg-[#EB4747]/20 hover:border-[#EB4747]/30 hover:text-[#EB4747] transition-all duration-200 group" 
                    aria-label="Attach File"
                    disabled={loading}
                    title="Attach image or audio file"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05 12 20.5a6 6 0 1 1-8.49-8.49l9.19-9.2a4 4 0 0 1 5.66 5.66L8.11 19.32" />
                    </svg>
                  </button>

                  <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={loading}
                    className={`flex-shrink-0 w-12 h-12 rounded-xl grid place-items-center border transition-all duration-200 group ${
                      isRecording 
                        ? 'bg-red-500 border-red-400 animate-pulse shadow-lg shadow-red-500/25' 
                        : 'bg-white/5 border-white/10 hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-400'
                    }`}
                    aria-label={isRecording ? "Stop Recording" : "Start Voice Recording"}
                    title={isRecording ? "Stop recording" : "Record voice message"}
                  >
                    {isRecording ? (
                      <div className="w-3 h-3 bg-white rounded-sm"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
                        <path d="M12 19v3" />
                      </svg>
                    )}
                  </button>

                  <button 
                    onClick={handleSend} 
                    disabled={loading || (!message.trim() && !selectedFile)} 
                    className="flex-shrink-0 h-12 px-6 rounded-xl bg-gradient-to-r from-[#EB4747] to-[#d13f3f] font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#d13f3f] hover:to-[#b83232] transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                    title={loading ? "Sending..." : "Send message"}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Sending...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>Send</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </div>
                    )}
                  </button>
                </div>
              </div>
            </div>
        </div>
        </div>
      </main>
    </div>
  );
};

export default CoachPage;


