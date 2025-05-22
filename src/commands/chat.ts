// src/commands/chat.ts
import { input, select } from "@inquirer/prompts";
import { MenuAction } from "@/types";
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
import { DatabaseService } from "../services/db";
import { trimLongWords } from "@/utils/helpers";

// const STDIN_READY_TIMEOUT = 5000; // No longer relevant

export async function startChat(): Promise<void> {
  const db = new DatabaseService();

  while (true) {
    const stats = db.getConversationStats();

    const action = await select({
      message: "Main Menu",
      choices: [
        {
          value: MenuAction.NEW_CHAT,
          name: "New Chat",
        },
        {
          value: MenuAction.CONTINUE,
          name: "Continue",
          disabled: stats.total === 0,
        },
        {
          value: MenuAction.VIEW_RECENT,
          name: "Recents",
          disabled: stats.total === 0,
        },
        {
          value: MenuAction.MANAGE,
          name: "Settings",
          disabled: stats.total === 0,
        },
      ],
    });

    switch (action) {
      case MenuAction.NEW_CHAT:
        await handleNewChat(db);
        break;

      case MenuAction.CONTINUE:
        await handleContinueChat(db);
        break;

      case MenuAction.VIEW_RECENT:
        await handleViewRecent(db);
        break;

      case MenuAction.MANAGE:
        await handleManageConversations(db);
        break;
    }
  }
}

async function handleNewChat(db: DatabaseService): Promise<void> {
  const title = await input({ message: "Title:" });
  const conversationId = db.createConversation(title);
  await startChatSession(db, conversationId);
}

async function handleContinueChat(db: DatabaseService): Promise<void> {
  const conversations = db.getRecentConversations(10);
  const selected = await select({
    message: "Select a conversation to continue:",
    choices: conversations.map(
      (conv) => ({
        value: conv.id,
        name: `${conv.title} \t${conv.message_count}⏣\tlast: ${new Date(conv.last_message_at!).toLocaleString()}`,
      }),
      { value: -1, name: "← 𝘽𝘼𝘾𝙆" },
    ),
  });

  await startChatSession(db, selected);
}

async function handleViewRecent(db: DatabaseService): Promise<void> {
  const conversations = db.getRecentConversations(10);

  logger.newLine();
  logger.log("Recent Conversations:");
  conversations.forEach((conv) => {
    logger.log(`- ${conv.title}`);
    logger.log(`  Messages: ${conv.message_count}`);
    logger.log(
      `  Last active: ${new Date(conv.last_message_at!).toLocaleString()}`,
    );
    logger.log("---");
  });
  logger.newLine();

  await promptContinue();
}

async function handleManageConversations(db: DatabaseService): Promise<void> {
  while (true) {
    const conversations = db.getRecentConversations(10);
    const action = await select({
      message: "Select Conversation to Manage:",
      choices: [
        ...(conversations.map((conv) => ({
          value: Number(conv.id),
          name: `${conv.title} \t${conv.message_count}⌬`,
        })) as { value: number; name: string }[]),
        { value: -1, name: "← 𝘽𝘼𝘾𝙆" },

        //
      ],
    });

    if (action === -1) break;

    const conversationId = action as number;
    const operation = await select({
      message: "What would you like to do?",
      choices: [
        { value: "view", name: "View messages" },
        { value: "delete", name: "Delete conversation" },
        { value: "back", name: "Go back" },
      ],
    });

    switch (operation) {
      case "view":
        await viewConversationMessages(db, conversationId);
        break;
      case "delete":
        await deleteConversation(db, conversationId);
        break;
    }
  }
}

async function viewConversationMessages(
  db: DatabaseService,
  conversationId: number,
): Promise<void> {
  const messages = db.getConversationMessages(conversationId);
  const conversation = db.getConversationById(conversationId);

  if (!conversation) {
    logger.error("Conversation not found");
    return;
  }

  logger.newLine();
  logger.log(theme.heading(conversation.title));
  logger.log(theme.subheading(`${messages.length} messages`));
  logger.newLine();

  messages.forEach((message) => {
    const prefix = message.role === "user" ? "|>" : "AI:";
    logger.log(
      theme[message.role === "user" ? "prompt" : "bot"](
        `${prefix} ${message.content}`,
      ),
    );
    logger.newLine();
  });

  await promptContinue();
}

async function deleteConversation(
  db: DatabaseService,
  conversationId: number,
): Promise<void> {
  const conversation = db.getConversationById(conversationId);

  if (!conversation) {
    logger.error("Conversation not found");
    return;
  }

  const confirm = await select({
    message: `Are you sure you want to delete "${conversation.title}"?`,
    choices: [
      { value: "yes", name: "Yes, delete it" },
      { value: "no", name: "No, keep it" },
    ],
  });

  if (confirm === "yes") {
    const deleted = db.deleteConversation(conversationId);
    if (deleted) {
      logger.success(`Deleted conversation: ${conversation.title}`);
    } else {
      logger.error("Failed to delete conversation");
    }
  }
}

async function promptContinue(): Promise<void> {
  await input({ message: "Press enter to continue..." });
}

async function startChatSession(
  db: DatabaseService,
  conversationId: number,
): Promise<void> {
  const cohereService = new ChatStreamService();
  const voiceService = new FishVoiceService();

  // Display welcome message
  logger.newLine();
  logger.log(theme.heading("re-up.ph to agi"));
  logger.log(theme.subheading("Powered by Cohere and Fish Audio"));
  logger.newLine();

  const chatHistory: ChatMessageV2[] =
    db.getConversationMessages(conversationId);
  let message: ChatMessageV2 | undefined = undefined;
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
    message = chatHistory[chatHistory.length - 1];
    if (message) db.saveMessage(conversationId, message);

    // Show spinner while waiting for response
    const spinner = createSpinner("...", {});
    spinner.start();

    let fullResponseText = ""; // Accumulate the full response text

    try {
      // logger.info("Starting Cohere chat stream...");
      const cohereStream = cohereService.chatStream(chatHistory);

      logger.newLine(); // Add a newline before starting streamed output

      // Consume the Cohere stream, display text chunks, and accumulate full text
      for await (const chunk of cohereStream) {
        const trimmedChunk = trimLongWords(chunk);
        fullResponseText += trimmedChunk;
        process.stdout.write(theme.bot(trimmedChunk));
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
    const voice_spinner = createSpinner("text", { spinner: "sand" });
    try {
      voice_spinner.start();
      // logger.info("Generating speech from full response text...");
      // Use generateSpeech which returns a complete buffer
      const audioBuffer = await voiceService.generateSpeech(fullResponseText);
      // logger.info(`Received audio buffer. Size: ${audioBuffer.length} bytes.`);

      if (audioBuffer.length > 44) {
        // Check if buffer size is more than a minimal WAV header (adjust for MP3 if needed)

        // Create a temporary file to save the audio
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`); // Using mp3 as format
        await fs.writeFile(tempFilePath, audioBuffer);

        // logger.info(`Saved audio to temporary file: ${tempFilePath}`);

        // Play the audio file using afplay (macOS)
        const afplayProcess = $`afplay ${tempFilePath}`;
        voice_spinner.stop();

        // Wait for afplay to finish playing and capture output
        const afplayOutput = await afplayProcess.text(); // Capture stdout and stderr

        if (afplayOutput.trim()) {
          logger.info(`afplay output: ${afplayOutput.trim()}`);
        }

        // logger.info("Audio playback finished.");
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
      if (tempFilePath !== undefined) {
        try {
          await fs.unlink(tempFilePath);
          // logger.info(`Cleaned up temporary file: ${tempFilePath}`);
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
      content: trimLongWords(fullResponseText),
    });
    message = chatHistory[chatHistory.length - 1];
    if (message) db.saveMessage(conversationId, message);
  }
}
