import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { DataService } from "../services/db";
import { ChatService } from "../services/cohere-v2";
import { OllamaChatService } from "../services/ollama";
import type { Message } from "@/types";

// Mock the services
mock.module("../services/db", () => {
  const mockMessages: Message[] = [];
  let conversationId = 1;
  
  return {
    DataService: class MockDataService {
      createConversation(title: string): number {
        return conversationId++;
      }
      
      saveMessage(conversationId: number, message: Message): void {
        mockMessages.push(message);
      }
      
      getConversationMessages(conversationId: number): Message[] {
        return mockMessages;
      }
      
      getConversationStats(): { total: number; messageCount: number } {
        return {
          total: 1,
          messageCount: mockMessages.length
        };
      }
      
      getRecentConversations(limit = 10): any[] {
        return [{
          id: 1,
          title: "Test Conversation",
          created_at: new Date().toISOString(),
          message_count: mockMessages.length,
          last_message_at: new Date().toISOString()
        }];
      }
      
      getConversationById(id: number): any {
        return {
          id: 1,
          title: "Test Conversation",
          created_at: new Date().toISOString(),
          message_count: mockMessages.length,
          last_message_at: new Date().toISOString()
        };
      }
      
      deleteConversation(id: number): boolean {
        return true;
      }
    }
  };
});

mock.module("../services/cohere-v2", () => {
  return {
    ChatService: class MockChatService {
      async *chatStream(messages: Message[]): AsyncIterable<string> {
        yield "Hello";
        yield ", ";
        yield "world!";
      }
    }
  };
});

mock.module("../services/ollama", () => {
  return {
    OllamaChatService: class MockOllamaChatService {
      async isOllamaRunning(): Promise<boolean> {
        return true;
      }
      
      async getAvailableModels(): Promise<any[]> {
        return [{
          name: "llama3.2",
          size: 4000000000
        }];
      }
      
      setModel(model: string): void {
        // Mock implementation
      }
      
      async *chatStream(messages: Message[]): AsyncIterable<string> {
        yield "Hello";
        yield ", ";
        yield "world!";
      }
    }
  };
});

// Import the module after mocking
import { startChat, handleNewChat } from "../commands/chat";

// Mock inquirer prompts
mock.module("@inquirer/prompts", () => {
  return {
    input: async () => "Test input",
    select: async () => "cohere" // Default to selecting cohere service
  };
});

describe("Chat Commands", () => {
  // We can't easily test the interactive parts directly
  // But we can test that the modules are properly imported and can be instantiated
  
  test("should import chat modules correctly", () => {
    expect(typeof startChat).toBe("function");
  });
  
  test("should create DataService instance", () => {
    const db = new DataService();
    expect(db).toBeDefined();
    expect(typeof db.createConversation).toBe("function");
  });
  
  test("should create ChatService instance", () => {
    const chatService = new ChatService();
    expect(chatService).toBeDefined();
    expect(typeof chatService.chatStream).toBe("function");
  });
  
  test("should create OllamaChatService instance", () => {
    const ollamaService = new OllamaChatService();
    expect(ollamaService).toBeDefined();
    expect(typeof ollamaService.chatStream).toBe("function");
  });
  
  test("should handle message conversion between services", async () => {
    // Create instances of both services
    const cohereService = new ChatService();
    const ollamaService = new OllamaChatService();
    
    // Create test messages using our custom Message type
    const messages: Message[] = [
      { role: "user", content: "Hello, AI!" },
      { role: "assistant", content: "Hello, human!" }
    ];
    
    // Test that both services can process the same messages
    let cohereOutput = "";
    for await (const chunk of cohereService.chatStream(messages)) {
      cohereOutput += chunk;
    }
    
    let ollamaOutput = "";
    for await (const chunk of ollamaService.chatStream(messages)) {
      ollamaOutput += chunk;
    }
    
    // Both services should be able to process the messages
    expect(cohereOutput).toBe("Hello, world!");
    expect(ollamaOutput).toBe("Hello, world!");
  });
});