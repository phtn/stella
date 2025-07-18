import recorder from "node-record-lpcm16";
import { createSpinner } from "../utils/spinner";
import { logger } from "../utils/logger";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import { transcribeInt16Array } from "./vcr";

// Load environment variables from .env.local
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
  logger.info("Loaded environment variables from .env.local");
} else {
  logger.warning(".env.local file not found");
}

export class STT_Service {
  private isRecording: boolean = false;
  private readonly MIN_SAMPLES = 512; // Minimum required by Leopard

  async checkThis(): Promise<string> {
    logger.info("checked");
    return "this";
  }

  async startRecording(): Promise<string> {
    return new Promise((resolve, reject) => {
      const rawChunks: Buffer[] = [];
      const spinner = createSpinner("Listening...", {});

      spinner.start();
      this.isRecording = true;

      const recording = recorder.record({
        sampleRate: 16000,
        channels: 1,
        audioType: "raw",
        recorder: "sox",
      });

      // Create cleanup function
      const cleanup = (): void => {
        if (this.isRecording) {
          this.isRecording = false;
          recording.stop();
          spinner.stop();
        }

        if (process.stdin.isTTY) {
          process.stdin.removeAllListeners("data");
          process.stdin.setRawMode(false);
          process.stdin.pause();
        }
      };

      // Handle keyboard input
      const keyHandler = (key: Buffer): void => {
        const keyStr = key.toString();
        if (keyStr === "q" || keyStr === "\u0003") {
          // 'q' or Ctrl+C
          if (this.isRecording) {
            cleanup();

            // Process the recorded audio
            this.processRecording(rawChunks).then(resolve).catch(reject);
          }
        }
      };

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", keyHandler);
      }

      // let totalSize = 0;
      recording
        .stream()
        .on("data", (chunk: Buffer | string) => {
          if (!this.isRecording) return;

          const bufferChunk = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, "binary");

          // totalSize += bufferChunk.length;
          rawChunks.push(bufferChunk);
        })
        .on("error", (err: Error) => {
          cleanup();
          reject(err);
        });
    });
  }

  private async processRecording(rawChunks: Buffer[]): Promise<string> {
    try {
      if (rawChunks.length === 0) {
        throw new Error("No audio data received");
      }

      const rawBuffer = Buffer.concat(rawChunks);
      const samples = new Int16Array(
        rawBuffer.buffer,
        rawBuffer.byteOffset,
        rawBuffer.length / Int16Array.BYTES_PER_ELEMENT,
      );

      if (samples.length < this.MIN_SAMPLES) {
        throw new Error(
          `Recording too short. Need at least ${this.MIN_SAMPLES} samples, got ${samples.length}`,
        );
      }

      return await this.transcribe(samples);
    } catch (error) {
      throw error;
    }
  }

  public async transcribe(audioBuffer: Int16Array): Promise<string> {
    if (!(audioBuffer instanceof Int16Array)) {
      throw new Error("Audio buffer must be an Int16Array");
    }

    const spinner = createSpinner("Transcribing...", {});
    spinner.start();

    try {
      const result = transcribeInt16Array(audioBuffer, { service: "whisper" });
      spinner.stop();

      // Add debug logging for the transcription result
      // logger.info(`Transcription result: "${result.transcript}"`);

      // Make sure we return a non-empty string
      return result ?? "Sorry, could not understand the audio";
    } catch (error) {
      spinner.stop();
      logger.error("Transcription failed");
      throw error;
    }
  }
}
