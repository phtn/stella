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
