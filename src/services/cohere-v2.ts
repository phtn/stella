import { gf2 } from "@/instructions/gf2";
import { CohereClientV2, CohereError, CohereTimeoutError } from "cohere-ai";
import type { ChatMessageV2 } from "cohere-ai/api";
import type { Message } from "@/types";

const token = process.env.COHERE_API_KEY;
const content = gf2;

export class ChatService {
  private client: CohereClientV2;

  constructor() {
    this.client = new CohereClientV2({ token });
  }

  // Convert our Message type to Cohere's ChatMessageV2 type
  private convertToCohereMessages(messages: Message[]): ChatMessageV2[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  async *chatStream(messages: Message[]): AsyncIterable<string> {
    try {
      const cohereMessages = this.convertToCohereMessages(messages);
      
      const stream = await this.client.chatStream({
        model: "command-a-03-2025",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content,
          },
          ...cohereMessages,
        ],
      });

      for await (const chatEvent of stream) {
        if (chatEvent.type === "content-delta") {
          const text = chatEvent.delta?.message?.content?.text ?? "";
          if (text) {
            yield text;
          }
        }
      }
    } catch (err) {
      console.log(err);
      if (err instanceof CohereTimeoutError) {
        console.log("Request timed out", err);
      } else if (err instanceof CohereError) {
        console.log(err.statusCode);
        console.log(err.message);
        console.log(err.body);
      }
      throw err;
    }
  }
}