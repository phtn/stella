import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { DataService } from "./db";
import type { Message } from "@/types";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "os";
import { existsSync } from "fs";

// Use a real file for robust testing
const TEST_DB_DIR = tmpdir();
const TEST_DB_PATH = join(TEST_DB_DIR, `stellar-test-${Date.now()}.db`);

describe("DataService Robust Tests", () => {
  let dataService: DataService;

  beforeEach(() => {
    // Create a new instance of DataService for each test
    dataService = new DataService(TEST_DB_PATH);
  });

  afterEach(async () => {
    // Clean up the test database after each test
    if (existsSync(TEST_DB_PATH)) {
      await unlink(TEST_DB_PATH);
    }
  });

  test("should persist data between service instances", () => {
    // Create a conversation with the first instance
    const title = "Persistent Conversation";
    const id = dataService.createConversation(title);
    
    // Add some messages
    dataService.saveMessage(id, { role: "user", content: "Hello" });
    dataService.saveMessage(id, { role: "assistant", content: "Hi there" });
    
    // Create a new instance pointing to the same database
    const newService = new DataService(TEST_DB_PATH);
    
    // Verify the data persisted
    const conversation = newService.getConversationById(id);
    expect(conversation).toBeDefined();
    expect(conversation?.title).toBe(title);
    
    const messages = newService.getConversationMessages(id);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Hello");
    expect(messages[1].content).toBe("Hi there");
  });

  test("should handle concurrent operations", async () => {
    // Create multiple conversations
    const ids = [];
    for (let i = 0; i < 10; i++) {
      ids.push(dataService.createConversation(`Conversation ${i}`));
    }
    
    // Add messages concurrently
    await Promise.all(ids.map(async (id, index) => {
      for (let i = 0; i < 5; i++) {
        dataService.saveMessage(id, { 
          role: i % 2 === 0 ? "user" : "assistant", 
          content: `Message ${i} for conversation ${index}` 
        });
      }
    }));
    
    // Verify all data was saved correctly
    for (let i = 0; i < ids.length; i++) {
      const messages = dataService.getConversationMessages(ids[i]);
      expect(messages).toHaveLength(5);
      
      for (let j = 0; j < 5; j++) {
        expect(messages[j].content).toBe(`Message ${j} for conversation ${i}`);
      }
    }
  });

  test("should handle large messages", () => {
    // Create a conversation
    const id = dataService.createConversation("Large Message Test");
    
    // Generate a large message (100KB)
    const largeContent = "A".repeat(100 * 1024);
    
    // Save the large message
    dataService.saveMessage(id, { role: "user", content: largeContent });
    
    // Retrieve and verify
    const messages = dataService.getConversationMessages(id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content.length).toBe(largeContent.length);
    expect(messages[0].content).toBe(largeContent);
  });

  test("should handle special characters in messages", () => {
    // Create a conversation
    const id = dataService.createConversation("Special Characters Test");
    
    // Message with special characters
    const specialContent = "Hello, 世界! こんにちは! Привет! 👋 🚀 \n\t\"'`~!@#$%^&*()_+-=[]{}|;:,.<>?/\\";
    
    // Save the message
    dataService.saveMessage(id, { role: "user", content: specialContent });
    
    // Retrieve and verify
    const messages = dataService.getConversationMessages(id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe(specialContent);
  });

  test("should handle system role messages", () => {
    // Create a conversation
    const id = dataService.createConversation("System Role Test");
    
    // Create messages with different roles
    const systemMessage: Message = { role: "system", content: "System instruction" };
    const userMessage: Message = { role: "user", content: "User message" };
    const assistantMessage: Message = { role: "assistant", content: "Assistant response" };
    
    // Save the messages
    dataService.saveMessage(id, systemMessage);
    dataService.saveMessage(id, userMessage);
    dataService.saveMessage(id, assistantMessage);
    
    // Retrieve and verify
    const messages = dataService.getConversationMessages(id);
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[2].role).toBe("assistant");
  });

  test("should handle error cases gracefully", () => {
    // Create a conversation
    const id = dataService.createConversation("Error Test");
    
    // Try to save a message with undefined content (should throw)
    expect(() => {
      dataService.saveMessage(id, { role: "user", content: undefined as any });
    }).toThrow();
    
    // Try to get a non-existent conversation
    const nonExistentConversation = dataService.getConversationById(9999);
    expect(nonExistentConversation).toBeFalsy();
    
    // Try to delete a non-existent conversation
    const deleteResult = dataService.deleteConversation(9999);
    expect(deleteResult).toBe(false);
  });
});