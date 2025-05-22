import { Database } from "bun:sqlite";
import path from "path";
import { mkdir } from "node:fs/promises";
import type { ChatMessageV2 } from "cohere-ai/api";
import type { Conversation, Message } from "@/types";

export class DatabaseService {
  private readonly db: Database;

  constructor() {
    const dbDir: string = path.join(process.env.HOME ?? "~", ".stella");
    const dbPath: string = path.join(dbDir, "conversations.db");

    // Create .stella directory if it doesn't exist
    try {
      mkdir(dbDir, { recursive: true }).catch(console.error);
    } catch (error) {
      // Only ignore EEXIST error
      if (
        error instanceof Error &&
        "code" in error &&
        error.code !== "EEXIST"
      ) {
        throw error;
      }
    }

    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    // Create conversations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table with foreign key
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);
  }

  public createConversation(title: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO conversations (title) VALUES (?)",
    );
    const result = stmt.run(title);
    return Number(result.lastInsertRowid);
  }

  public saveMessage(conversationId: number, message: ChatMessageV2): void {
    const stmt = this.db.prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
    );
    if (message.content !== undefined) {
      stmt.run(
        conversationId,
        message.role,
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content),
      );
    } else {
      throw new Error("Message content cannot be undefined");
    }
  }

  public getConversations(): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT
        c.*,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    return stmt.all() as Conversation[];
  }

  public getConversationMessages(conversationId: number): ChatMessageV2[] {
    const stmt = this.db.prepare(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
    );
    const messages = stmt.all(conversationId) as Message[];

    return messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
  }

  public getConversationStats(): { total: number; messageCount: number } {
    const stmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM conversations) as total,
        (SELECT COUNT(*) FROM messages) as messageCount
    `);
    return stmt.get() as { total: number; messageCount: number };
  }

  public getRecentConversations(limit = 10): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT
        c.*,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Conversation[];
  }

  public getConversationById(id: number): Conversation | undefined {
    const stmt = this.db.prepare(`
      SELECT
        c.*,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_at
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.id = ?
      GROUP BY c.id
    `);
    return stmt.get(id) as Conversation | undefined;
  }

  public deleteConversation(id: number): boolean {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare("DELETE FROM conversations WHERE id = ?");
      const result = stmt.run(id);
      return result.changes > 0;
    });

    return transaction();
  }
}
