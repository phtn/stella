import type { WebSocketState } from "@/types";
import WebSocket from "ws";

// PlayHT specific types
interface PlayHTVoice {
  id: string;
  name: string;
  sample_rate: number;
  language: string;
  language_code: string;
  gender: string;
  age: string;
  accent: string;
  style: string;
  tempo: string;
  loudness: string;
  texture: string;
  is_cloned: boolean;
  voice_engine: string;
}

interface PlayHTVoicesResponse {
  voices: PlayHTVoice[];
}

interface PlayHTStreamRequest {
  text: string;
  voice: string;
  output_format: "mp3" | "wav" | "ogg" | "flac";
  voice_engine: "PlayHT2.0-turbo" | "PlayHT2.0" | "PlayHT1.0" | "PlayDialog";
  emotion?:
    | "female_happy"
    | "female_sad"
    | "female_angry"
    | "female_fearful"
    | "female_disgust"
    | "female_surprised"
    | "male_happy"
    | "male_sad"
    | "male_angry"
    | "male_fearful"
    | "male_disgust"
    | "male_surprised";
  speed?: number; // 0.1 to 5.0
  sample_rate?: 22050 | 24000 | 44100 | 48000;
  seed?: number;
  temperature?: number; // 0.1 to 2.0
}

export interface PlayHTStreamResponse {
  url: string;
}

interface PlayHTWebSocketMessage {
  type: "audio" | "error" | "done";
  data?: Uint8Array;
  message?: string;
}

const apiKey = process.env.PLAYHT_API_KEY;
const userId = process.env.PLAYHT_USER_ID;
const defaultVoiceId = process.env.MADDIE_ID;

const POLLING_INTERVAL = 10; // ms

export class PlayHT_TTS_Service {
  private static readonly BASE_URL = "https://api.play.ht/api/v2";
  private static readonly WS_URL = "wss://api.play.ht/v2/tts/stream";

  async getVoices(): Promise<PlayHTVoicesResponse> {
    const url = `${PlayHT_TTS_Service.BASE_URL}/voices`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-USER-ID": userId!,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`PlayHT API error: ${response.statusText}`);
    }

    return response.json() as Promise<PlayHTVoicesResponse>;
  }

  async generateSpeech(
    text: string,
    voiceId: string = defaultVoiceId!,
    options: Partial<PlayHTStreamRequest> = {},
  ): Promise<Buffer> {
    const url = `${PlayHT_TTS_Service.BASE_URL}/tts/stream`;

    const requestBody: PlayHTStreamRequest = {
      text,
      speed: 1.0,
      voice: voiceId,
      temperature: 0.5,
      sample_rate: 24000,
      output_format: "mp3",
      voice_engine: "PlayDialog",
      ...options,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-USER-ID": userId!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`PlayHT API error: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return Buffer.from(audioData);
  }

  async *streamSpeech(
    textStream: AsyncIterable<string>,
    voiceId: string = defaultVoiceId!,
    options: Partial<PlayHTStreamRequest> = {},
  ): AsyncGenerator<Buffer> {
    const ws = new WebSocket(PlayHT_TTS_Service.WS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-USER-ID": userId!,
      },
    });

    await this.setupWebSocketConnection(ws, voiceId, options);

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
        // PlayHT sends binary audio data directly or JSON messages
        if (this.isBinaryAudioData(data)) {
          audioQueue.push(data);
        } else {
          const message = JSON.parse(data.toString()) as PlayHTWebSocketMessage;
          console.log("Received PlayHT WebSocket message:", message.type);

          switch (message.type) {
            case "audio":
              if (message.data) {
                audioQueue.push(Buffer.from(message.data));
              }
              break;
            case "done":
              console.log("PlayHT finished streaming.");
              onFinish();
              ws.close();
              break;
            case "error":
              console.error("PlayHT error:", message.message);
              break;
          }
        }
      } catch (error) {
        // If JSON parsing fails, treat as binary audio data
        if (this.isBinaryAudioData(data)) {
          audioQueue.push(data);
        } else {
          console.error("Error processing WebSocket message:", error);
        }
      }
    });
  }

  private async setupWebSocketConnection(
    ws: WebSocket,
    voiceId: string = defaultVoiceId!,
    options: Partial<PlayHTStreamRequest> = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        console.log("PlayHT WebSocket connected.");

        const initMessage = {
          voice: voiceId,
          output_format: "mp3",
          voice_engine: "PlayDialog",
          speed: 1.0,
          sample_rate: 24000,
          temperature: 1.0,
          ...options,
        };

        ws.send(JSON.stringify(initMessage));
        resolve();
      });

      ws.on("error", (error: Error) => {
        console.error("PlayHT WebSocket error:", error);
        reject(error);
      });

      ws.on("close", (code: number, reason: Buffer) => {
        console.log(
          `PlayHT WebSocket closed with code ${code} and reason: ${reason.toString()}`,
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
        if (text.trim()) {
          const textMessage = {
            type: "text",
            text: text.trim(),
          };
          ws.send(JSON.stringify(textMessage));
        }
      }

      // Signal end of text stream
      const endMessage = {
        type: "end",
      };
      ws.send(JSON.stringify(endMessage));
    } catch (error) {
      console.error("Error sending text to PlayHT WebSocket:", error);
    }
  }

  private isBinaryAudioData(data: Buffer): boolean {
    // Check if data starts with common audio file headers
    const mp3Header =
      data.length > 2 && data[0] === 0xff && (data?.[1] ?? 0 & 0xe0) === 0xe0;
    const wavHeader =
      data.length > 4 &&
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46;

    return mp3Header || wavHeader || data.length > 1000; // Assume large buffers are audio
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
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  // Utility method to get a specific voice by characteristics
  async findVoice(criteria: {
    gender?: string;
    language?: string;
    accent?: string;
    age?: string;
  }): Promise<PlayHTVoice | null> {
    const voices = await this.getVoices();

    return (
      voices.voices.find(
        (voice) =>
          (criteria.gender !== null ||
            voice.gender.toLowerCase() === criteria.gender) &&
          (criteria.language !== null ||
            voice.language.toLowerCase().includes(criteria.language)) &&
          (criteria.accent !== null ||
            voice.accent.toLowerCase().includes(criteria.accent)) &&
          (criteria.age !== undefined ||
            voice.age.toLowerCase() === criteria.age),
      ) || null
    );
  }
}
