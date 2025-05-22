import * as msgpack from "@msgpack/msgpack";
import WebSocket from "ws";

type WebSocketState = 0 | 1 | 2 | 3; // Numeric values for WebSocket states

interface ModelAuthor {
  _id: string;
  nickname: string;
  avatar: string;
}

interface ModelItem {
  _id: string;
  type: string;
  title: string;
  description: string;
  cover_image: string;
  train_mode: string;
  state: string;
  tags: string[];
  samples: string[];
  created_at: string;
  updated_at: string;
  languages: string[];
  visibility: string;
  lock_visibility: boolean;
  like_count: number;
  mark_count: number;
  shared_count: number;
  task_count: number;
  unliked: boolean;
  liked: boolean;
  marked: boolean;
  author: ModelAuthor;
}

interface ModelResponse {
  total: number;
  items: ModelItem[];
}

export interface ModelListParams {
  page_size?: number;
  page_number?: number;
  title?: string;
  tag?: string[] | string;
  self?: boolean;
  author_id?: string;
  language?: string[] | string;
  title_language?: string[] | string;
  sort_by?: string;
}

interface WSMessage {
  event: string;
  audio?: Uint8Array;
  message?: string;
}

const key = process.env.FISH_AUDIO_API_KEY;
const reference_id = process.env.REFERENCE_ID;
const WS_URL = "wss://api.fish.audio/v1/tts/live";
const POLLING_INTERVAL = 10; // ms

export class FishVoiceService {
  private static readonly BASE_URL = "https://api.fish.audio";

  async getModels(id: string): Promise<ModelResponse> {
    const url = `${FishVoiceService.BASE_URL}/model/${id}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`[GET]:FishAudio API error: ${response.statusText}`);
    }

    return response.json() as Promise<ModelResponse>;
  }

  async generateSpeech(text: string): Promise<Buffer> {
    const url = `${FishVoiceService.BASE_URL}/v1/tts`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/msgpack",
        model: "speech-1.5",
      },
      body: msgpack.encode({
        reference_id,
        text,
        temperature: 0.3,
        top_p: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fish Audio API error: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return Buffer.from(audioData);
  }

  async *streamSpeech(textStream: AsyncIterable<string>): AsyncGenerator<Buffer> {
    const ws = new WebSocket(WS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    await this.setupWebSocketConnection(ws);

    const audioQueue: Buffer[] = [];
    let streamingFinished = false;

    this.setupMessageHandler(ws, audioQueue, () => {
      streamingFinished = true;
    });

    void this.processTextStream(ws, textStream);

    while (true) {
      if (audioQueue.length > 0) {
        yield audioQueue.shift()!;
      } else if (streamingFinished && audioQueue.length === 0) {
        break;
      } else if (this.isWebSocketActive(ws.readyState)) {
        await this.delay(POLLING_INTERVAL);
      } else {
        console.error(
          "WebSocket not open/connecting, and streaming not finished. Exiting audio stream.",
          ws.readyState
        );
        break;
      }
    }

    this.closeWebSocketIfNeeded(ws);
  }

  private setupMessageHandler(
    ws: WebSocket,
    audioQueue: Buffer[],
    onFinish: () => void
  ): void {
    ws.on("message", (data: Buffer) => {
      try {
        const message = msgpack.decode(data) as WSMessage;
        console.log("Received WebSocket message event:", message.event);

        switch (message.event) {
          case "audio":
            if (message.audio) {
              audioQueue.push(Buffer.from(message.audio));
            }
            break;
          case "log":
            console.log("Fish Audio log:", message.message);
            break;
          case "finish":
            console.log("Fish Audio finished streaming.");
            onFinish();
            ws.close();
            break;
          case "error":
            console.error("Fish Audio error event:", message);
            break;
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });
  }

  private async setupWebSocketConnection(ws: WebSocket): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        console.log("Fish Audio WebSocket connected.");
        const startMessage = msgpack.encode({
          event: "start",
          request: {
            text: "",
            latency: "normal",
            format: "mp3",
            reference_id,
          },
        });
        ws.send(startMessage);
        resolve();
      });

      ws.on("error", reject);
      ws.on("close", (code: number, reason: string) => {
        console.log(
          `Fish Audio WebSocket closed with code ${code} and reason: ${reason}`
        );
      });
    });
  }

  private async processTextStream(
    ws: WebSocket,
    textStream: AsyncIterable<string>
  ): Promise<void> {
    try {
      for await (const text of textStream) {
        if (text) {
          const textMessage = msgpack.encode({ event: "text", text });
          ws.send(textMessage);
        }
      }
      const stopMessage = msgpack.encode({ event: "stop" });
      ws.send(stopMessage);
    } catch (error) {
      console.error("Error sending text to WebSocket:", error);
    }
  }

  private isWebSocketActive(readyState: WebSocketState): boolean {
    return readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING;
  }

  private closeWebSocketIfNeeded(ws: WebSocket): void {
    if (this.isWebSocketActive(ws.readyState)) {
      ws.close();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
