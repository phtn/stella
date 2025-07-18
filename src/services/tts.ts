import type { ModelResponse, WebSocketState, WSMessage } from "@/types";
import * as msgpack from "@msgpack/msgpack";
import WebSocket from "ws";

const key = process.env.FISH_AUDIO_API_KEY;
const reference_id = process.env.REFERENCE_ID;
const WS_URL = "wss://api.fish.audio/v1/tts/live";
const POLLING_INTERVAL = 10; // ms

export class TTS_Service {
  private static readonly BASE_URL = "https://api.fish.audio";

  async getModels(id: string): Promise<ModelResponse> {
    const url = `${TTS_Service.BASE_URL}/model/${id}`;
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
    const url = `${TTS_Service.BASE_URL}/v1/tts`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/msgpack",
        model: "speech-1.6",
      },
      body: msgpack.encode({
        reference_id,
        text,
        temperature: 0.4,
        top_p: 0.2,
        normalize: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fish Audio API error: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return Buffer.from(audioData);
  }

  async *streamSpeech(
    textStream: AsyncIterable<string>,
  ): AsyncGenerator<Buffer> {
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
          ws.readyState,
        );
        break;
      }
    }

    this.closeWebSocketIfNeeded(ws);
  }

  private setupMessageHandler(
    ws: WebSocket,
    audioQueue: Buffer[],
    onFinish: () => void,
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
          `Fish Audio WebSocket closed with code ${code} and reason: ${reason}`,
        );
      });
    });
  }

  private async processTextStream(
    ws: WebSocket,
    textStream: AsyncIterable<string>,
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
