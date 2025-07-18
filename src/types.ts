// src/types.ts

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
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

export interface DatabaseResult {
  lastInsertRowid: number;
  changes: number;
}

export enum MenuAction {
  NEW_CHAT = "new_chat",
  CONTINUE = "continue",
  VIEW_RECENT = "view_recent",
  MANAGE = "manage",
}

// TTS

export type WebSocketState = 0 | 1 | 2 | 3; // Numeric values for WebSocket states

export interface ModelAuthor {
  _id: string;
  nickname: string;
  avatar: string;
}

export interface ModelItem {
  _id: string;
  type: string;
  title: string;
  description: string;
  cover_image: string;
  train_mode: string;
  state: string;
  tags: string[];
  samples: string[];
  created_at: string;
  updated_at: string;
  languages: string[];
  visibility: string;
  lock_visibility: boolean;
  like_count: number;
  mark_count: number;
  shared_count: number;
  task_count: number;
  unliked: boolean;
  liked: boolean;
  marked: boolean;
  author: ModelAuthor;
}

export interface ModelResponse {
  total: number;
  items: ModelItem[];
}

export interface ModelListParams {
  page_size?: number;
  page_number?: number;
  title?: string;
  tag?: string[] | string;
  self?: boolean;
  author_id?: string;
  language?: string[] | string;
  title_language?: string[] | string;
  sort_by?: string;
}

export interface WSMessage {
  event: string;
  audio?: Uint8Array;
  message?: string;
}

// PLAYHT
export interface WSUrls {
  "Play3.0-mini": string;
  PlayDialog: string;
  PlayDialogArabic: string;
  PlayDialogMultilingual: string;
}
export interface PHT_WebsocketUrls {
  websocket_urls: WSUrls;
  expires_at: Date;
}