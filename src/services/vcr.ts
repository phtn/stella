import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";

interface TranscriptionResult {
  text: string;
  confidence: number;
  duration: number;
  language?: string;
}

export interface TranscriptionError {
  message: string;
  code: string;
  details?: string;
}

class AudioTranscriber {
  private tempDir: string;

  constructor(
    tempDir: string = "/var/folders/km/wkyzsyvd2f70mq20gzbwj1sw0000gn/T/",
  ) {
    this.tempDir = tempDir;
  }

  private createWavFromInt16Array(
    audioData: Int16Array,
    sampleRate: number = 16000,
    channels: number = 1,
  ): Buffer {
    const length = audioData.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string): void => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, "RIFF");
    view.setUint32(4, 36 + length * 2, true); // file size
    writeString(8, "WAVE");

    // fmt chunk
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, channels, true); // number of channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * channels * 2, true); // byte rate
    view.setUint16(32, channels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // data chunk
    writeString(36, "data");
    view.setUint32(40, length * 2, true); // data size

    // Write audio data
    for (let i = 0; i < length; i++) {
      view.setInt16(44 + i * 2, audioData?.[i] ?? 0, true);
    }

    return Buffer.from(arrayBuffer);
  }

  private async saveInt16ArrayAsWav(
    audioData: Int16Array,
    sampleRate: number = 16000,
    channels: number = 1,
  ): Promise<string> {
    const wavBuffer = this.createWavFromInt16Array(
      audioData,
      sampleRate,
      channels,
    );
    const outputPath = path.join(this.tempDir, `temp_${Date.now()}.wav`);

    await fs.writeFile(outputPath, wavBuffer);
    return outputPath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async validateAudioFile(filePath: string): Promise<void> {
    const exists = await this.fileExists(filePath);
    if (!exists) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (![".wav", ".mp3", ".m4a", ".flac", ".ogg"].includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }
  }

  private async convertToWav(inputPath: string): Promise<string> {
    const outputPath = path.join(this.tempDir, `temp_${Date.now()}.wav`);

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        inputPath,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-y",
        outputPath,
      ]);

      let errorOutput = "";

      ffmpeg.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });

      ffmpeg.on("close", (code: number) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg conversion failed: ${errorOutput}`));
        }
      });

      ffmpeg.on("error", (error: Error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });
    });
  }

  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  // Transcribe Int16Array with local Whisper
  public async transcribeInt16ArrayWithLocalWhisper(
    audioData: Int16Array,
    sampleRate: number = 16000,
    channels: number = 1,
    model: string = "/usr/local/bin/ggml-base",
  ): Promise<TranscriptionResult> {
    const tempWavPath = await this.saveInt16ArrayAsWav(
      audioData,
      sampleRate,
      channels,
    );

    try {
      return await this.transcribeWithLocalWhisper(tempWavPath, model);
    } finally {
      await this.cleanupTempFile(tempWavPath);
    }
  }
  public async transcribeWithLocalWhisper(
    filePath: string,
    model: string = "/usr/local/bin/ggml-base",
  ): Promise<TranscriptionResult> {
    await this.validateAudioFile(filePath);

    let wavPath = filePath;
    let shouldCleanup = false;

    // Convert to WAV if needed
    if (path.extname(filePath).toLowerCase() !== ".wav") {
      wavPath = await this.convertToWav(filePath);
      shouldCleanup = true;
    }

    return new Promise((resolve, reject) => {
      const whisper = spawn("whisper-cli", [
        wavPath,
        "--model",
        model,
        "--output_format",
        "json",
        "--output_dir",
        this.tempDir,
      ]);

      let errorOutput = "";

      whisper.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });

      whisper.on("close", async (code: number) => {
        try {
          if (code !== 0) {
            throw new Error(`Whisper failed: ${errorOutput}`);
          }

          // Read the generated JSON file
          const baseName = path.basename(wavPath, path.extname(wavPath));
          const jsonPath = path.join(this.tempDir, `${baseName}.json`);

          const jsonContent = await fs.readFile(jsonPath, "utf-8");
          const result = JSON.parse(jsonContent) as {
            text: string;
            segments: Array<{ start: number; end: number }>;
          };

          // Calculate duration from segments
          const duration =
            result.segments.length > 0
              ? Math.max(...result.segments.map((s) => s.end))
              : 0;

          // Cleanup
          await this.cleanupTempFile(jsonPath);
          if (shouldCleanup) {
            await this.cleanupTempFile(wavPath);
          }

          resolve({
            text: result.text.trim(),
            confidence: 0.9, // Whisper doesn't provide confidence scores
            duration,
          });
        } catch (error) {
          if (shouldCleanup) {
            await this.cleanupTempFile(wavPath);
          }
          reject(error);
        }
      });

      whisper.on("error", async (error: Error) => {
        if (shouldCleanup) {
          await this.cleanupTempFile(wavPath);
        }
        reject(new Error(`Whisper spawn error: ${error.message}`));
      });
    });
  }
}

// Main transcription function for Int16Array
export async function transcribeInt16Array(
  audioData: Int16Array,
  options: {
    service: "openai" | "assemblyai" | "whisper";
    apiKey?: string;
    model?: string;
    tempDir?: string;
    sampleRate?: number;
    channels?: number;
  },
): Promise<string> {
  const transcriber = new AudioTranscriber(options.tempDir);
  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? 1;

  try {
    const result = await transcriber.transcribeInt16ArrayWithLocalWhisper(
      audioData,
      sampleRate,
      channels,
      options.model,
    );

    return result.text;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Transcription failed: ${err.message}`);
  }
}

// Main transcription function with multiple service options
export async function transcribeAudioFile(
  filePath: string,
  options: {
    service: "openai" | "assemblyai" | "whisper";
    apiKey?: string;
    model?: string;
    tempDir?: string;
  },
): Promise<string> {
  const transcriber = new AudioTranscriber(options.tempDir);

  try {
    const result = await transcriber.transcribeWithLocalWhisper(
      filePath,
      options.model,
    );

    return result.text;
  } catch (error) {
    const err = error as Error;
    throw new Error(`Transcription failed: ${err.message}`);
  }
}
