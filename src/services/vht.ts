// import { PlayHTTTSService } from "./pht";

// interface VoiceServiceConfig {
//   apiKey: string;
//   userId: string;
//   voice?: string;
//   quality?: "draft" | "low" | "medium" | "high" | "premium";
//   outputFormat?: "mp3" | "wav" | "ogg" | "flac" | "mulaw";
//   speed?: number;
// }

// export class PHT_Service {
//   private ttsService: PlayHTTTSService;
//   private isInitialized: boolean = false;

//   constructor(config: VoiceServiceConfig) {
//     this.ttsService = new PlayHTTTSService({
//       apiKey: config.apiKey,
//       userId: config.userId,
//       voice: config.voice,
//       quality: config.quality || "medium",
//       outputFormat: config.outputFormat || "mp3",
//       speed: config.speed ?? 1.0,
//       sampleRate: 24000,
//       temperature: 0.5,
//     });
//   }

//   async initialize(): Promise<void> {
//     if (this.isInitialized) {
//       return;
//     }

//     try {
//       await this.ttsService.connect();
//       this.isInitialized = true;
//     } catch (error) {
//       throw new Error(
//         `Failed to initialize voice service: ${error instanceof Error ? error.message : String(error)}`,
//       );
//     }
//   }

//   async generateSpeech(text: string): Promise<Buffer> {
//     if (!this.isInitialized) {
//       await this.initialize();
//     }

//     if (!text || text.trim().length === 0) {
//       throw new Error("Text cannot be empty");
//     }

//     try {
//       const audioBuffer = await this.ttsService.synthesize(text);
//       return audioBuffer;
//     } catch (error) {
//       throw new Error(
//         `Speech generation failed: ${error instanceof Error ? error.message : String(error)}`,
//       );
//     }
//   }

//   async generateSpeechToFile(
//     text: string,
//     outputPath: string,
//   ): Promise<string> {
//     if (!this.isInitialized) {
//       await this.initialize();
//     }

//     if (!text || text.trim().length === 0) {
//       throw new Error("Text cannot be empty");
//     }

//     try {
//       return await this.ttsService.synthesizeToFile(text, outputPath);
//     } catch (error) {
//       throw new Error(
//         `Speech generation to file failed: ${error instanceof Error ? error.message : String(error)}`,
//       );
//     }
//   }

//   updateVoice(voiceId: string): void {
//     this.ttsService.updateVoice(voiceId);
//   }

//   updateQuality(
//     quality: "draft" | "low" | "medium" | "high" | "premium",
//   ): void {
//     this.ttsService.updateQuality(quality);
//   }

//   updateSpeed(speed: number): void {
//     this.ttsService.updateSpeed(speed);
//   }

//   isConnected(): boolean {
//     return this.ttsService.isServiceConnected();
//   }

//   disconnect(): void {
//     this.ttsService.disconnect();
//     this.isInitialized = false;
//   }

//   // Cleanup method for graceful shutdown
//   async cleanup(): Promise<void> {
//     this.disconnect();
//   }
// }
