// import WebSocket from "ws";
// import { EventEmitter } from "events";
// import * as fs from "fs";
// import * as path from "path";
// import type { PHT_WebsocketUrls } from "@/types";
// import { logger } from "@/utils/logger";

// interface PlayHTConfig {
//   apiKey: string;
//   userId: string;
//   voice?: string;
//   quality?: "draft" | "low" | "medium" | "high" | "premium";
//   outputFormat?: "mp3" | "wav" | "ogg" | "flac" | "mulaw";
//   speed?: number;
//   sampleRate?: 8000 | 16000 | 22050 | 24000 | 44100 | 48000;
//   seed?: number;
//   temperature?: number;
// }

// interface TTSMessage {
//   type: "setup" | "speak" | "flush";
//   data?: {
//     text?: string;
//     voice?: string;
//     quality?: string;
//     output_format?: string;
//     speed?: number;
//     sample_rate?: number;
//     seed?: number;
//     temperature?: number;
//   };
// }

// interface AudioChunk {
//   type: "audio";
//   data: string; // base64 encoded audio
//   offset: number;
//   duration: number;
// }

// interface ErrorMessage {
//   type: "error";
//   message: string;
//   code?: string;
// }

// interface StatusMessage {
//   type: "status";
//   status: "connected" | "ready" | "speaking" | "finished" | "error";
// }

// type PlayHTMessage = AudioChunk | ErrorMessage | StatusMessage;

// export class PlayHTTTSService extends EventEmitter {
//   private ws: WebSocket | null = null;
//   private config: PlayHTConfig;
//   private isConnected: boolean = false;
//   private audioChunks: Buffer[] = [];
//   private outputPath: string | null = null;

//   constructor(config: PlayHTConfig) {
//     super();
//     this.config = {
//       quality: "medium",
//       outputFormat: "mp3",
//       speed: 1.0,
//       sampleRate: 24000,
//       temperature: 0.5,
//       ...config,
//     };
//   }

//   async getWs(userId: string, apiKey: string): Promise<string> {
//     console.log(userId, apiKey);
//     const response = await fetch("https://api.play.ht/api/v4/websocket-auth", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//         "X-User-Id": userId,
//         "Content-Type": "application/json",
//       },
//     });

//     if (!response.ok) {
//       console.error("Error", response.statusText);
//     }

//     const { websocket_urls } = (await response.json()) as PHT_WebsocketUrls;
//     return websocket_urls["PlayDialog"];
//   }

//   async connect(): Promise<void> {
//     const wsUrl = await this.getWs(this.config.userId, this.config.apiKey);

//     return new Promise((resolve, reject) => {
//       this.ws = new WebSocket(wsUrl);

//       this.ws.on("open", () => {
//         logger.success("ws");
//         this.isConnected = true;
//         this.emit("connected");
//         this.setupSession();
//         resolve();
//       });

//       this.ws.on("message", (data: Buffer, isBinary: boolean) => {
//         if (isBinary) {
//           // This is raw binary data, not JSON. Ignore or handle as needed.
//           // console.log("Received binary data from PlayHT, length:", data.length);
//           return;
//         }
//         try {
//           const raw = data.toString("utf8");
//           const message = JSON.parse(raw);
//           this.handleMessage(message);
//         } catch (error) {
//           console.error(
//             "Error parsing WebSocket message:",
//             error,
//             "Raw data (utf8):",
//             data.toString("utf8")
//           );
//           this.emit("error", error);
//         }
//       });

//       this.ws.on("error", (error: Error) => {
//         console.error("WebSocket error:", error);
//         this.emit("error", error);
//         reject(error);
//       });

//       this.ws.on("close", (code: number, reason: Buffer) => {
//         console.log(`WebSocket closed: ${code} - ${reason.toString()}`);
//         this.isConnected = false;
//         this.emit("disconnected");
//       });

//       // Set connection timeout
//       setTimeout(() => {
//         if (!this.isConnected) {
//           reject(new Error("Connection timeout"));
//         }
//       }, 10000);
//     });
//   }

//   private setupSession(): void {
//     if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
//       throw new Error("WebSocket is not connected");
//     }

//     const setupMessage: TTSMessage = {
//       type: "setup",
//       data: {
//         voice: this.config.voice,
//         quality: this.config.quality,
//         output_format: this.config.outputFormat,
//         speed: this.config.speed,
//         sample_rate: this.config.sampleRate,
//         temperature: this.config.temperature,
//         ...(this.config.seed !== undefined && { seed: this.config.seed }),
//       },
//     };

//     this.ws.send(JSON.stringify(setupMessage));
//   }

//   private handleMessage(message: PlayHTMessage): void {
//     if (message.type === "audio" && typeof message.data === "string") {
//       console.log(
//         `Received audio chunk: type=audio, data.length=${message.data.length}, offset=${message.offset}, duration=${message.duration}`
//       );
//     } else {
//       console.log("Received message from PlayHT:", message);
//     }
//     switch (message.type) {
//       case "audio":
//         this.handleAudioChunk(message);
//         break;
//       case "error":
//         console.error("PlayHT Error:", message.message);
//         this.emit("error", new Error(message.message));
//         break;
//       case "status":
//         console.log("Status:", message.status);
//         this.emit("status", message.status);
//         if (message.status === "finished") {
//           this.finalizeAudio();
//         }
//         break;
//       default:
//         null;
//     }
//   }

//   private handleAudioChunk(chunk: AudioChunk): void {
//     try {
//       const audioBuffer = Buffer.from(chunk.data, "base64");
//       this.audioChunks.push(audioBuffer);
//       this.emit("audioChunk", {
//         buffer: audioBuffer,
//         offset: chunk.offset,
//         duration: chunk.duration,
//       });
//     } catch (error) {
//       console.error("Error processing audio chunk:", error);
//       this.emit("error", error);
//     }
//   }

//   private finalizeAudio(): void {
//     if (this.audioChunks.length === 0) {
//       console.log("No audio chunks received");
//       return;
//     }

//     const fullAudio = Buffer.concat(this.audioChunks);

//     if (this.outputPath !== null) {
//       this.saveAudioToFile(fullAudio, this.outputPath);
//     }

//     this.emit("audioComplete", fullAudio);
//     this.audioChunks = []; // Clear chunks for next synthesis
//   }

//   private saveAudioToFile(audioBuffer: Buffer, filePath: string): void {
//     try {
//       const dir = path.dirname(filePath);
//       if (!fs.existsSync(dir)) {
//         fs.mkdirSync(dir, { recursive: true });
//       }

//       fs.writeFileSync(filePath, audioBuffer);
//       console.log(`Audio saved to: ${filePath}`);
//       this.emit("fileSaved", filePath);
//     } catch (error) {
//       console.error("Error saving audio file:", error);
//       this.emit("error", error);
//     }
//   }

//   async synthesize(text: string, outputPath?: string): Promise<Buffer> {
//     return new Promise((resolve, reject) => {
//       if (
//         !this.isConnected ||
//         !this.ws ||
//         this.ws.readyState !== WebSocket.OPEN
//       ) {
//         reject(new Error("Not connected to PlayHT service"));
//         return;
//       }

//       this.outputPath = outputPath ?? null;
//       this.audioChunks = []; // Reset audio chunks

//       // Set up completion handler
//       const onComplete = (audioBuffer: Buffer): void => {
//         this.off("audioComplete", onComplete);
//         this.off("error", onError);
//         resolve(audioBuffer);
//       };

//       const onError = (error: Error): void => {
//         this.off("audioComplete", onComplete);
//         this.off("error", onError);
//         reject(error);
//       };

//       this.once("audioComplete", onComplete);
//       this.once("error", onError);

//       // Send text to synthesize
//       const speakMessage = {
//         type: "speak",
//         text,
//       };

//       console.log("Sent speak message:", speakMessage);

//       this.ws.send(JSON.stringify(speakMessage));

//       // Send flush to complete synthesis
//       const flushMessage: TTSMessage = {
//         type: "flush",
//       };

//       console.log("Sent flush message:", flushMessage);

//       this.ws.send(JSON.stringify(flushMessage));

//       // Set synthesis timeout
//       setTimeout(() => {
//         this.off("audioComplete", onComplete);
//         this.off("error", onError);
//         console.error("SYNTHESIS TIMEOUT: No response from PlayHT in 30s");
//         reject(new Error("Synthesis timeout"));
//       }, 30000);
//     });
//   }

//   async synthesizeToFile(text: string, outputPath: string): Promise<string> {
//     await this.synthesize(text, outputPath);
//     return outputPath;
//   }

//   async synthesizeStream(text: string): Promise<NodeJS.ReadableStream> {
//     const { Readable } = require("stream");
//     const stream = new Readable({ read(): void {} });

//     if (
//       !this.isConnected ||
//       !this.ws ||
//       this.ws.readyState !== WebSocket.OPEN
//     ) {
//       stream.destroy(new Error("Not connected to PlayHT service"));
//       return stream;
//     }

//     // Handle audio chunks as they arrive
//     const onAudioChunk = (chunk: { buffer: Buffer }): void => {
//       stream.push(chunk.buffer);
//     };

//     const onComplete = (): void => {
//       stream.push(null); // End the stream
//       this.off("audioChunk", onAudioChunk);
//       this.off("audioComplete", onComplete);
//       this.off("error", onError);
//     };

//     const onError = (error: Error): void => {
//       stream.destroy(error);
//       this.off("audioChunk", onAudioChunk);
//       this.off("audioComplete", onComplete);
//       this.off("error", onError);
//     };

//     this.on("audioChunk", onAudioChunk);
//     this.once("audioComplete", onComplete);
//     this.once("error", onError);

//     // Send synthesis requests
//     const speakMessage = {
//       type: "speak",
//       text,
//     };

//     console.log("Sent speak message:", speakMessage);

//     this.ws.send(JSON.stringify(speakMessage));

//     const flushMessage: TTSMessage = {
//       type: "flush",
//     };

//     console.log("Sent flush message:", flushMessage);

//     this.ws.send(JSON.stringify(flushMessage));

//     return stream;
//   }

//   updateVoice(voice: string): void {
//     this.config.voice = voice;
//     if (this.isConnected) {
//       this.setupSession();
//     }
//   }

//   updateQuality(quality: PlayHTConfig["quality"]): void {
//     if (quality) {
//       this.config.quality = quality;
//       if (this.isConnected) {
//         this.setupSession();
//       }
//     }
//   }

//   updateSpeed(speed: number): void {
//     this.config.speed = Math.max(0.1, Math.min(3.0, speed));
//     if (this.isConnected) {
//       this.setupSession();
//     }
//   }

//   disconnect(): void {
//     if (this.ws) {
//       this.ws.close();
//       this.ws = null;
//     }
//     this.isConnected = false;
//   }

//   isServiceConnected(): boolean {
//     return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
//   }

//   // CLI-specific utility methods
//   async initializeForCLI(): Promise<void> {
//     console.log("Initializing PlayHT TTS Service...");
//     await this.connect();
//     console.log("Service ready for synthesis");
//   }

//   async processTextFile(inputPath: string, outputPath: string): Promise<void> {
//     if (!fs.existsSync(inputPath)) {
//       throw new Error(`Input file not found: ${inputPath}`);
//     }

//     console.log(`Reading text from: ${inputPath}`);
//     const text = fs.readFileSync(inputPath, "utf-8");

//     console.log(`Synthesizing text (${text.length} characters)...`);
//     await this.synthesizeToFile(text, outputPath);
//     console.log(`Audio generated successfully: ${outputPath}`);
//   }
// }
