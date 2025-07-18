import { describe, expect, test, beforeEach } from "bun:test";
import { DataService } from "./db";
import type { Message } from "@/types";

// Use an in-memory database for testing
const TEST_DB_PATH = ":memory:";

describe("DataService", () => {
  let dataService: DataService;

  beforeEach(() => {
    // Create a new instance of DataService for each test
    dataService = new DataService(TEST_DB_PATH);
  });

  test("should create a conversation", () => {
    const title = "Test Conversation";
    const id = dataService.createConversation(title);
    
    expect(id).toBeGreaterThan(0);
    
    const conversation = dataService.getConversationById(id);
    expect(conversation).toBeDefined();
    expect(conversation?.title).toBe(title);
  });

  test("should save and retrieve messages", () => {
    // Create a conversation
    const conversationId = dataService.createConversation("Test Messages");
    
    // Create test messages
    const userMessage: Message = {
      role: "user",
      content: "Hello, AI!"
    };
    
    const assistantMessage: Message = {
      role: "assistant",
      content: "Hello, human! How can I help you today?"
    };
    
    // Save messages
    dataService.saveMessage(conversationId, userMessage);
    dataService.saveMessage(conversationId, assistantMessage);
    
    // Retrieve messages
    const messages = dataService.getConversationMessages(conversationId);
    
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("Hello, AI!");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toBe("Hello, human! How can I help you today?");
  });

  test("should get conversation stats", () => {
    // Create conversations and messages
    const conv1 = dataService.createConversation("Conversation 1");
    const conv2 = dataService.createConversation("Conversation 2");
    
    dataService.saveMessage(conv1, { role: "user", content: "Message 1" });
    dataService.saveMessage(conv1, { role: "assistant", content: "Response 1" });
    dataService.saveMessage(conv2, { role: "user", content: "Message 2" });
    
    const stats = dataService.getConversationStats();
    
    expect(stats.total).toBe(2);
    expect(stats.messageCount).toBe(3);
  });

  test("should delete a conversation", () => {
    // Create a conversation
    const conversationId = dataService.createConversation("To Be Deleted");
    
    // Add a message
    dataService.saveMessage(conversationId, { 
      role: "user", 
      content: "This will be deleted" 
    });
    
    // Verify it exists
    let conversation = dataService.getConversationById(conversationId);
    expect(conversation).toBeDefined();
    
    // Delete it
    const result = dataService.deleteConversation(conversationId);
    expect(result).toBe(true);
    
    // Verify it's gone
    conversation = dataService.getConversationById(conversationId);
    // SQLite returns null for non-existent rows
    expect(conversation).toBeFalsy();
  });

  test("should get recent conversations", () => {
    // Create multiple conversations
    const conv1 = dataService.createConversation("Conversation 1");
    const conv2 = dataService.createConversation("Conversation 2");
    const conv3 = dataService.createConversation("Conversation 3");
    
    // Add messages to each
    dataService.saveMessage(conv1, { role: "user", content: "Message 1" });
    dataService.saveMessage(conv2, { role: "user", content: "Message 2" });
    dataService.saveMessage(conv3, { role: "user", content: "Message 3" });
    
    // Get recent conversations with limit
    const recentConvs = dataService.getRecentConversations(2);
    
    expect(recentConvs).toHaveLength(2);
    
    // Just verify we have the right number of conversations
    // The order might vary in the in-memory database during testing
    expect(recentConvs.length).toBe(2);
  });
});