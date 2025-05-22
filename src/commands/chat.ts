// src/commands/chat.ts
import { input } from "@inquirer/prompts";
import type { ChatOptions } from "../types";
import { ChatStreamService } from "../services/cohere-v2";
import { FishVoiceService } from "../services/fish";
import { logger } from "../utils/logger";
import { theme } from "../utils/theme";
import { createSpinner } from "../utils/spinner";
import type { ChatMessageV2 } from "cohere-ai/api";
import { $ } from "bun";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const COHERE_TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 3; // Retries are now handled within the Cohere service or by allowing error propagation
const RETRY_DELAY = 2000; // 2 seconds
// const STDIN_READY_TIMEOUT = 5000; // No longer relevant

export async function startChat(options: ChatOptions): Promise<void> {
  // Get API key from options or environment variable
  // const apiKey = options.apiKey || process.env.COHERE_API_KEY;

  // if (!apiKey) {
  //   logger.error(
  //     "API key is required. Provide it with --api-key or set COHERE_API_KEY environment variable.\n",
  //   );
  //   process.exit(1);
  // }

  // Initialize Cohere service
  const cohereService = new ChatStreamService();
  const voiceService = new FishVoiceService();

  // Display welcome message
  logger.newLine();
  logger.log(theme.heading("Sad Space"));
  logger.log(theme.subheading("Powered by Cohere Command Models"));
  logger.log(theme.system('Type "exit" or press Ctrl+C to quit'));
  logger.newLine();

  // Initialize chat history
  const chatHistory: ChatMessageV2[] = [];

  // Start chat loop
  while (true) {
    // Get user input
    const userMessage = await input({
      message: theme.prompt("|>"),
    });

    // Check if user wants to exit
    if (userMessage.toLowerCase() === "exit") {
      logger.success("Chat session ended");
      break;
    }

    // Add user message to history
    chatHistory.push({
      role: "user",
      content: userMessage,
    });

    // Show spinner while waiting for response
    const spinner = createSpinner("Generating response...");
    spinner.start();

    let fullResponseText = ""; // Accumulate the full response text

    try {
      logger.info("Starting Cohere chat stream...");
      const cohereStream = cohereService.chatStream(chatHistory);

      logger.newLine(); // Add a newline before starting streamed output

      // Consume the Cohere stream, display text chunks, and accumulate full text
      for await (const chunk of cohereStream) {
        // Display the text chunk using process.stdout.write (no automatic newline)
        fullResponseText += chunk; // Accumulate full text
      }
      spinner.stop(); // Stop spinner on error
      process.stdout.write(theme.bot(fullResponseText));
      // Add a final newline after the streamed text output
      process.stdout.write("\n");

      // Log the full accumulated response text for debugging
      // logger.log(`Full response text accumulated: ${fullResponseText}`);
    } catch (error) {
      spinner.stop(); // Stop spinner on error
      logger.error(`Error during Cohere streaming: ${error}`);
      // If there was an error getting the response text, skip voice and history update for this turn
      continue;
    } finally {
      // Stop spinner after successful streaming or error
      spinner.stop();
    }

    // After getting the full response text, generate speech and play it
    let tempFilePath: string | undefined;
    try {
      logger.info("Generating speech from full response text...");
      // Use generateSpeech which returns a complete buffer
      const audioBuffer = await voiceService.generateSpeech(fullResponseText);
      logger.info(`Received audio buffer. Size: ${audioBuffer.length} bytes.`);

      if (audioBuffer.length > 44) {
        // Check if buffer size is more than a minimal WAV header (adjust for MP3 if needed)

        // Create a temporary file to save the audio
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`); // Using mp3 as format
        await fs.writeFile(tempFilePath, audioBuffer);

        logger.info(`Saved audio to temporary file: ${tempFilePath}`);

        // Play the audio file using afplay (macOS)
        const afplayProcess = $`afplay ${tempFilePath}`;

        // Wait for afplay to finish playing and capture output
        const afplayOutput = await afplayProcess.text(); // Capture stdout and stderr

        if (afplayOutput.trim()) {
          logger.info(`afplay output: ${afplayOutput.trim()}`);
        }

        logger.info("Audio playback finished.");
      } else {
        logger.warning(
          "Audio buffer received but is too small to likely contain audio data.",
        );
      }
    } catch (error) {
      logger.error(`Error during voice generation or playback: ${error}`);
      // Continue without voice if there's an error here, text is already displayed.
    } finally {
      // Clean up the temporary file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
          logger.info(`Cleaned up temporary file: ${tempFilePath}`);
        } catch (cleanupError) {
          logger.error(
            `Error cleaning up temporary file ${tempFilePath}: ${cleanupError}`,
          );
        }
      }
    }

    // Add AI response to history (using the accumulated full text)
    chatHistory.push({
      role: "assistant",
      content: fullResponseText,
    });
  }
}
