// src/commands/chat.ts
import { MenuAction, type Message } from "@/types";
import { trimLongWords } from "@/utils/helpers";
import { input, select } from "@inquirer/prompts";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ChatService } from "../services/cohere-v2";
import { OllamaChatService } from "../services/ollama";
import { DataService } from "../services/db";
import { STT_Service } from "../services/stt";
import { TTS_Service } from "../services/tts";
import { logger, type Logger } from "../utils/logger";
import { createSpinner } from "../utils/spinner";
import { theme } from "../utils/theme";
// import { PlayHT_TTS_Service } from "@/services/pht2";

// const voiceService = new PHT_Service({
//   apiKey: process.env.PLAYHT_API_KEY!, // Set in your environment
//   userId: process.env.PLAYHT_USER_ID!, // Set in your environment
//   voice: process.env.ELLIE_ID!, // ELLIE!
//   quality: "high", // or 'medium', 'premium' etc.
//   outputFormat: "mp3",
//   speed: 1.0,
// });

// Initialize the service when your app starts
export async function initializeVoiceService(): Promise<void> {
  try {
    // await voiceService.initialize();

    logger.success("voice is ready");
  } catch (error) {
    console.error("Failed to initialize voice service:", error);
    throw error;
  }
}

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
  const conversations = db.getRecentConversations(100);
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

async function startChatSession(
  db: DataService,
  conversationId: number,
): Promise<void> {
  // Service selection
  const serviceType = await select({
    message: "Select AI service:",
    choices: [
      { value: "cohere", name: "Cohere (Cloud)" },
      { value: "ollama", name: "Ollama (Local)" },
    ],
  });

  let chatService: ChatService | OllamaChatService;
  let serviceName = "";

  if (serviceType === "ollama") {
    const ollamaService = new OllamaChatService();

    // Check if Ollama is running
    const spinner = createSpinner("Checking Ollama connection...", {});
    spinner.start();

    try {
      const isRunning = await ollamaService.isOllamaRunning();
      spinner.stop();

      if (!isRunning) {
        logger.error(
          "Ollama is not running. Please start Ollama and try again.",
        );
        logger.info("Run: ollama serve");
        return;
      }

      // Get available models
      const models = await ollamaService.getAvailableModels();

      if (models.length === 0) {
        logger.error("No Ollama models found. Please pull a model first.");
        logger.info("Example: ollama pull llama3.2");
        return;
      }

      // Let user select model
      const selectedModel = await select({
        message: "Select Ollama model:",
        choices: models.map((model) => ({
          value: model.name,
          name: `${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(1)}GB)`,
        })),
      });

      ollamaService.setModel(selectedModel);
      chatService = ollamaService;
      serviceName = `Ollama (${selectedModel})`;
    } catch (error) {
      spinner.stop();
      logger.error(`Failed to connect to Ollama: ${error}`);
      return;
    }
  } else {
    chatService = new ChatService();
    serviceName = "Cohere";
  }

  const voiceService = new TTS_Service();
  const speechService = new STT_Service();

  async function handleChatResponse(
    fullResponseText: string,
    logger: Logger,
  ): Promise<void> {
    // After getting the full response text, generate speech and play it
    let tempFilePath: string | undefined;
    const voice_spinner = createSpinner("Generating speech...", {
      spinner: "sand",
    });

    if (false) {
      try {
        voice_spinner.start();

        // This is the only line that changes - your existing interface is preserved
        const audioBuffer =
          fullResponseText &&
          (await voiceService.generateSpeech(fullResponseText));

        if (audioBuffer.length > 50) {
          const tempDir = os.tmpdir();
          tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`);
          await fs.writeFile(tempFilePath ?? "", audioBuffer);

          voice_spinner.start("Playing audio...");
          const afplayProcess = `afplay ${tempFilePath}`;
          voice_spinner.stop();

          await afplayProcess;

          // Clean up temp file
          await fs.unlink(tempFilePath ?? "").catch(() => {});
        }
      } catch (error) {
        voice_spinner.stop();
        logger.error(
          `Voice generation/playback error: ${error instanceof Error ? error : String(error)}`,
        );
      } finally {
        voice_spinner.stop();
      }
    }
  }
  async function handleVoiceInput(): Promise<string> {
    logger.info("Mic's on");
    return await speechService.startRecording();
  }

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
    logger.log(theme.subheading(`Powered by ${serviceName}`));
    logger.newLine();

    const dbMessages: Message[] = db.getConversationMessages(conversationId);
    // Use our custom Message type directly
    const chatHistory: Message[] = dbMessages;
    let message: Message | undefined = undefined;
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
        const chatStream = chatService.chatStream(chatHistory);
        spinner.stop(); // Stop spinner before streaming starts

        logger.newLine(); // Add a newline before starting streamed output

        // Consume the chat stream, display text chunks, and accumulate full text
        for await (const chunk of chatStream) {
          const trimmedChunk = trimLongWords(chunk);
          fullResponseText += trimmedChunk;
          process.stdout.write(theme.bot(trimmedChunk));
        }

        // Add a final newline after the streamed text output
        process.stdout.write("\n");
      } catch (error) {
        spinner.stop(); // Stop spinner on error
        logger.error(`Error during chat streaming: ${error}`);
        // If there was an error getting the response text, skip voice and history update for this turn
        continue;
      }

      await handleChatResponse(fullResponseText, logger);

      // After getting the full response text, generate speech and play it
      // let tempFilePath: string | undefined;
      // const voice_spinner = createSpinner("text", { spinner: "sand" });
      // try {
      //   voice_spinner.start();
      //   const audioBuffer = await voiceService.generateSpeech(fullResponseText);

      //   if (audioBuffer.length > 50) {
      //     const tempDir = os.tmpdir();
      //     tempFilePath = path.join(tempDir, `audio-${Date.now()}.mp3`);

      //     await fs.writeFile(tempFilePath, audioBuffer);

      //     const afplayProcess = $`afplay ${tempFilePath}`;
      //     voice_spinner.stop();

      //     await afplayProcess;

      //     // Clean up temp file
      //     await fs.unlink(tempFilePath).catch(() => { });
      //   }
      // } catch (error) {
      //   voice_spinner.stop();
      //   logger.error(
      //     `Voice generation/playback error: ${error instanceof Error ? error.message : String(error)}`,
      //   );
      // } finally {
      //   voice_spinner.stop();
      // }

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
