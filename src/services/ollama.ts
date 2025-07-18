import { gf } from "@/instructions/gf";
import type { Message } from "@/types";

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaModelsResponse {
  models: OllamaModel[];
}

export class OllamaChatService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = "http://localhost:11434", model = "llama3.2") {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  // Our Message type already matches Ollama's format, but we'll add a conversion method for consistency
  private convertToOllamaMessages(messages: Message[]): OllamaMessage[] {
    return messages.map(msg => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content
    }));
  }

  async *chatStream(messages: Message[]): AsyncIterable<string> {
    try {
      const ollamaMessages: OllamaMessage[] = [
        {
          role: "system",
          content: process.env.CHAT_INSTRUCT as string,
        },
        ...this.convertToOllamaMessages(messages),
      ];

      const request: OllamaChatRequest = {
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: 0.2,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data: OllamaChatResponse = JSON.parse(line);
                if (data.message?.content) {
                  yield data.message.content;
                }
                if (data.done) {
                  return;
                }
              } catch (parseError) {
                console.warn(
                  "Failed to parse Ollama response line:",
                  line,
                  parseError,
                );
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Ollama chat error:", error);
      throw error;
    }
  }

  async chat(messages: Message[]): Promise<string> {
    const ollamaMessages: OllamaMessage[] = [
      {
        role: "system",
        content: gf,
      },
      ...this.convertToOllamaMessages(messages),
    ];

    const request: OllamaChatRequest = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: 0.2,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: OllamaChatResponse =
        (await response.json()) as OllamaChatResponse;
      return data.message?.content || "";
    } catch (error) {
      console.error("Ollama chat error:", error);
      throw error;
    }
  }

  setModel(model: string): void {
    this.model = model;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: OllamaModelsResponse =
        (await response.json()) as OllamaModelsResponse;
      return data.models;
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
      throw error;
    }
  }

  async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}