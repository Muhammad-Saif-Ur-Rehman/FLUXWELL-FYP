import { API_ENDPOINTS } from '../config/api';

export type CoachMode = 'text' | 'voice' | 'image';

export async function sendCoachMessage(params: {
  message?: string;
  mode?: CoachMode;
  style?: string;
  file?: File | null;
}): Promise<{ reply?: string; error?: string; transcription?: string; transcription_confidence?: string }>
{
  const form = new FormData();
  if (params.message) form.append('user_message', params.message);
  form.append('mode', params.mode || 'text');
  form.append('style', params.style || 'friendly');
  if (params.file) form.append('file', params.file);

  const res = await fetch(API_ENDPOINTS.AI.COACH.CHAT, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  
  if (!res.ok) {
    return { error: `Server error: ${res.status} ${res.statusText}` };
  }
  
  const data = await res.json().catch(() => ({ error: 'Invalid response from server' }));
  return data;
}


