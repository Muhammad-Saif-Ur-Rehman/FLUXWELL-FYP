import { API_ENDPOINTS } from '../config/api';

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string;
  last_message_time?: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  content: string;
  message_type: string;
  is_user: boolean;
  file_data?: {
    name: string;
    type: string;
    url: string;
  };
  mode_data?: {
    transcription?: string;
    transcription_confidence?: string;
  };
  timestamp: string;
  context_used?: any;
  response_metadata?: any;
}

export interface ChatHistoryResponse {
  sessions: ChatSession[];
  total_sessions: number;
  current_page: number;
  total_pages: number;
}

export interface SessionMessagesResponse {
  session: ChatSession;
  messages: ChatMessage[];
  conversation_memory?: {
    session_id: string;
    user_preferences: Record<string, any>;
    conversation_context: any[];
    key_topics: string[];
    user_goals: string[];
    fitness_profile: Record<string, any>;
    updated_at: string;
  };
}

export class ChatHistoryService {
  private static getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  static async createSession(title?: string): Promise<ChatSession> {
    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/sessions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.statusText}`);
    }

    return response.json();
  }

  static async getChatHistory(
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<ChatHistoryResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search) {
      params.append('search', search);
    }

    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/sessions?${params}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get chat history: ${response.statusText}`);
    }

    return response.json();
  }

  static async getSessionMessages(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<SessionMessagesResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/sessions/${sessionId}?${params}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get session messages: ${response.statusText}`);
    }

    return response.json();
  }

  static async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const formData = new FormData();
    formData.append('title', title);

    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/sessions/${sessionId}/title`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to update session title: ${response.statusText}`);
    }
  }

  static async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }
  }

  static async sendMessage(params: {
    message?: string;
    mode?: 'text' | 'voice' | 'image';
    style?: string;
    sessionId?: string;
    file?: File | null;
  }): Promise<{ 
    reply?: string; 
    error?: string; 
    transcription?: string; 
    transcription_confidence?: string;
    session_id?: string;
  }> {
    const formData = new FormData();
    
    if (params.message) formData.append('user_message', params.message);
    formData.append('mode', params.mode || 'text');
    formData.append('style', params.style || 'friendly');
    if (params.sessionId) formData.append('session_id', params.sessionId);
    if (params.file) formData.append('file', params.file);

    const response = await fetch(`${API_ENDPOINTS.AI.COACH.BASE}/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      return { error: `Server error: ${response.status} ${response.statusText}` };
    }

    const data = await response.json().catch(() => ({ error: 'Invalid response from server' }));
    return data;
  }
}
