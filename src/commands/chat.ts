// src/commands/chat.ts
import { MenuAction } from "@/types";
import { trimLongWords } from "@/utils/helpers";
import { input, select } from "@inquirer/prompts";
import { $ } from "bun";
import type { ChatMessageV2 } from "cohere-ai/api";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ChatService } from "../services/cohere-v2";
import { DataService } from "../services/db";
import { STT_Service } from "../services/stt";
import { TTS_Service } from "../services/tts";
import { logger } from "../utils/logger";
import { createSpinner } from "../utils/spinner";
import { theme } from "../utils/theme";

// const STDIN_READY_TIMEOUT = 5000; // No longer relevant

const restoreTerminal = (): void => {
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
    }
  } catch (e) {
    console.log(e);
    // Ignore cleanup errors
  }
};

export async function startChat(): Promise<void> {
  const db = new DataService();

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

async function handleNewChat(db: DataService): Promise<void> {
  const title = await input({ message: "Title:" });
  const conversationId = db.createConversation(title);
  await startChatSession(db, conversationId);
}

async function handleContinueChat(db: DataService): Promise<void> {
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

async function handleViewRecent(db: DataService): Promise<void> {
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

async function handleManageConversations(db: DataService): Promise<void> {
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
  db: DataService,
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
  db: DataService,
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

async function handleVoiceInput(): Promise<string> {
  const speechService = new STT_Service();
  logger.info("Mic's on");
  return await speechService.startRecording();
}

async function startChatSession(
  db: DataService,
  conversationId: number,
): Promise<void> {
  const cohereService = new ChatService();
  const voiceService = new TTS_Service();

  // Setup terminal handlers
  process.on("SIGINT", restoreTerminal);
  process.on("SIGTERM", restoreTerminal);
  process.on("exit", restoreTerminal);

  // Initial terminal setup
  try {
    if (process.stdin.isTTY && !process.stdin.isRaw) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
  } catch (e) {
    logger.warning(`Could not set raw mode on terminal ${e}`);
  }

  try {
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
      // Add input type selection
      const inputType = await select({
        message: "Input method:",
        choices: [
          { value: "text", name: "Type message" },
          { value: "voice", name: "Voice input" },
          { value: "exit", name: "Exit chat" },
        ],
      });

      if (inputType === "exit") {
        restoreTerminal();
        logger.success("Chat session ended");
        break;
      }

      let userMessage: string;

      if (inputType === "voice") {
        try {
          // No need to set raw mode here, STT_Service handles it
          userMessage = await handleVoiceInput();
          logger.success(userMessage);
        } catch (error) {
          logger.error(`Voice input failed: ${error}`);
          continue;
        }
      } else {
        // For text input, ensure terminal is in the right mode
        if (process.stdin.isTTY && process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
        userMessage = await input({
          message: theme.prompt("|>"),
        });
      }

      // Check if user wants to exit
      if (userMessage.toLowerCase() === "exit") {
        restoreTerminal();
        logger.success("Chat session ended");
        break;
      }

      // Add user message to history
      chatHistory.push({
        role: "user",
        content: String(userMessage),
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
        const audioBuffer = await voiceService.generateSpeech(fullResponseText);

        if (audioBuffer.length > 50) {
          const tempDir = os.tmpdir();
          tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`);

          await fs.writeFile(tempFilePath, audioBuffer);

          const afplayProcess = $`afplay ${tempFilePath}`;
          voice_spinner.stop();

          await afplayProcess;

          // Clean up temp file
          await fs.unlink(tempFilePath).catch(() => { });
        }
      } catch (error) {
        voice_spinner.stop();
        logger.error(
          `Voice generation/playback error: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        voice_spinner.stop();
      }

      // Add AI response to history (using the accumulated full text)
      chatHistory.push({
        role: "assistant",
        content: trimLongWords(fullResponseText),
      });
      message = chatHistory[chatHistory.length - 1];
      if (message) db.saveMessage(conversationId, message);
    }
  } catch (error) {
    logger.error(`Chat session error: ${error}`);
  } finally {
    // Cleanup
    restoreTerminal();
  }
}
