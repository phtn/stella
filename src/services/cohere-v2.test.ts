import { describe, expect, test, mock, beforeEach } from "bun:test";
import { ChatService } from "./cohere-v2";
import type { Message } from "@/types";
import { CohereClientV2 } from "cohere-ai";

// Mock the Cohere client
mock.module("cohere-ai", () => {
  return {
    CohereClientV2: class MockCohereClient {
      chatStream({ messages }) {
        const systemMessage = messages[0];
        const userMessages = messages.slice(1);
        
        return {
          [Symbol.asyncIterator]: async function* () {
            // Simulate streaming response
            yield {
              type: "content-delta",
              delta: {
                message: {
                  content: {
                    text: "Hello",
                  },
                },
              },
            };
            
            yield {
              type: "content-delta",
              delta: {
                message: {
                  content: {
                    text: ", ",
                  },
                },
              },
            };
            
            yield {
              type: "content-delta",
              delta: {
                message: {
                  content: {
                    text: "world!",
                  },
                },
              },
            };
            
            yield {
              type: "finish",
              finish_reason: "complete",
            };
          },
        };
      }
    },
    CohereError: class MockCohereError extends Error {
      constructor(message, statusCode, body) {
        super(message);
        this.statusCode = statusCode;
        this.body = body;
      }
    },
    CohereTimeoutError: class MockCohereTimeoutError extends Error {},
  };
});

describe("ChatService (Cohere)", () => {
  let chatService: ChatService;
  
  beforeEach(() => {
    // Reset environment before each test
    process.env.COHERE_API_KEY = "test-api-key";
    chatService = new ChatService();
  });
  
  test("should stream chat response", async () => {
    const messages: Message[] = [
      { role: "user", content: "Hello, AI!" }
    ];
    
    const chunks: string[] = [];
    for await (const chunk of chatService.chatStream(messages)) {
      chunks.push(chunk);
    }
    
    expect(chunks).toEqual(["Hello", ", ", "world!"]);
  });
  
  test("should handle empty messages gracefully", async () => {
    const messages: Message[] = [];
    
    const chunks: string[] = [];
    for await (const chunk of chatService.chatStream(messages)) {
      chunks.push(chunk);
    }
    
    // Even with empty messages, the system prompt should trigger a response
    expect(chunks).toEqual(["Hello", ", ", "world!"]);
  });
});