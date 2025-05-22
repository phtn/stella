import { CohereClientV2, CohereError, CohereTimeoutError } from "cohere-ai";
import type { ChatMessageV2 } from "cohere-ai/api";

const token = process.env.COHERE_API_KEY;
const content = process.env.CHAT_INSTRUCT!;

export class ChatStreamService {
  private client: CohereClientV2;

  constructor() {
    this.client = new CohereClientV2({ token });
  }

  async* chatStream(messages: ChatMessageV2[]): AsyncIterable<string> {
    try {
      const stream = await this.client.chatStream({
        model: "command-a-03-2025",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content,
          },
          ...messages,
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
