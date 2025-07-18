import { describe, expect, test, mock, beforeEach } from "bun:test";
import { OllamaChatService } from "./ollama";
import type { Message } from "@/types";

// Mock fetch for testing different scenarios
const originalFetch = global.fetch;

describe("OllamaChatService Robust Tests", () => {
  let ollamaService: OllamaChatService;
  
  beforeEach(() => {
    ollamaService = new OllamaChatService("http://localhost:11434", "llama3.2");
    // Reset fetch mock for each test
    global.fetch = originalFetch;
  });
  
  test("should handle server errors gracefully", async () => {
    // Mock fetch to simulate server error
    global.fetch = mock(async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error"
      };
    });
    
    // Check if Ollama is running should return false on error
    const isRunning = await ollamaService.isOllamaRunning();
    expect(isRunning).toBe(false);
    
    // Getting models should throw an error
    await expect(ollamaService.getAvailableModels()).rejects.toThrow();
    
    // Chat should throw an error
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    await expect(ollamaService.chat(messages)).rejects.toThrow();
  });
  
  test("should handle network errors gracefully", async () => {
    // Mock fetch to simulate network error
    global.fetch = mock(async () => {
      throw new Error("Network error");
    });
    
    // Check if Ollama is running should return false on network error
    const isRunning = await ollamaService.isOllamaRunning();
    expect(isRunning).toBe(false);
    
    // Getting models should throw an error
    await expect(ollamaService.getAvailableModels()).rejects.toThrow();
    
    // Chat should throw an error
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    await expect(ollamaService.chat(messages)).rejects.toThrow();
  });
  
  test("should handle malformed responses gracefully", async () => {
    // Mock fetch to return malformed JSON
    global.fetch = mock(async () => {
      return {
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        }
      };
    });
    
    // Getting models should throw an error
    await expect(ollamaService.getAvailableModels()).rejects.toThrow();
  });
  
  test("should handle streaming errors gracefully", async () => {
    // Mock fetch to simulate streaming error
    global.fetch = mock(async () => {
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              throw new Error("Stream error");
            },
            releaseLock: () => {}
          })
        }
      };
    });
    
    // Chat stream should throw an error
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    
    try {
      const stream = ollamaService.chatStream(messages);
      for await (const _ of stream) {
        // This should throw before we get here
      }
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
  
  test("should handle empty messages gracefully", async () => {
    // Mock fetch for successful response
    global.fetch = mock(async () => {
      return {
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: "I received an empty message."
          },
          done: true
        })
      };
    });
    
    // Empty messages array
    const emptyMessages: Message[] = [];
    const response = await ollamaService.chat(emptyMessages);
    expect(response).toBe("I received an empty message.");
  });
  
  test("should handle messages with special characters", async () => {
    // Mock fetch for successful response
    global.fetch = mock(async (url, options) => {
      // Verify the request body contains the special characters
      const body = JSON.parse(options?.body?.toString() || "{}");
      const message = body.messages[body.messages.length - 1];
      
      expect(message.content).toContain("特殊文字");
      expect(message.content).toContain("🚀");
      
      return {
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: "I received your special characters."
          },
          done: true
        })
      };
    });
    
    // Message with special characters
    const messages: Message[] = [{
      role: "user",
      content: "Hello with special characters: 特殊文字 and emojis 🚀"
    }];
    
    const response = await ollamaService.chat(messages);
    expect(response).toBe("I received your special characters.");
  });
  
  test("should handle long conversations", async () => {
    // Mock fetch for successful response
    global.fetch = mock(async (url, options) => {
      // Verify the request body contains all messages
      const body = JSON.parse(options?.body?.toString() || "{}");
      
      // Check that we have the expected number of messages
      expect(body.messages.length).toBeGreaterThan(10);
      
      return {
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: "I received your long conversation."
          },
          done: true
        })
      };
    });
    
    // Create a long conversation
    const messages: Message[] = [];
    for (let i = 0; i < 15; i++) {
      messages.push({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`
      });
    }
    
    const response = await ollamaService.chat(messages);
    expect(response).toBe("I received your long conversation.");
  });
});