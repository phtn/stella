// src/types.ts
export interface ChatMessage {
  role: "USER" | "ASSISTANT";
  message: string;
}

export interface ChatOptions {
  model: string;
  apiKey?: string;
}

export interface CohereResponse {
  text: string;
  finish_reason: string;
  generation_id: string;
}
export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  message_count?: number;
  last_message_at?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface DatabaseResult {
  lastInsertRowid: number;
  changes: number;
}

export enum MenuAction {
  NEW_CHAT = 'new_chat',
  CONTINUE = 'continue',
  VIEW_RECENT = 'view_recent',
  MANAGE = 'manage'
}