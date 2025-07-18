#!/usr/bin/env node

import { Command } from "commander";
import { startChat } from "./commands/chat";
import { logger } from "./utils/logger";
import { theme } from "./utils/theme";

// await initializeVoiceService();

// Create CLI program
const program = new Command();

// Set program metadata
program
  .name("stellar")
  .description(
    "A SpaceX-inspired CLI chat application using Cohere Command models",
  )
  .version("1.0.0");

// Register chat command
program
  .command("chat")
  .description("Start a chat session with a Cohere Command model")
  .option("-m, --model <model>", "Specify the model to use", "command")
  .option("-k, --api-key <key>", "Your Cohere API key")
  .action(async () => {
    try {
      await startChat();
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Error: ${error.message}`);
      } else {
        logger.error("An unknown error occurred");
      }
      process.exit(1);
    }
  });

// Add help text for environment variables
program.addHelpText(
  "after",
  `
Environment Variables:
  COHERE_API_KEY    Your Cohere API key (alternative to --api-key option)
`,
);

// Parse command line arguments
program.parse();

// Show help if no arguments provided
if (process.argv.length <= 2) {
  logger.log(theme.heading("SpaceSex"));
  logger.log(theme.subheading("A SEX-inspired CLI chat application"));
  logger.newLine();
  program.help();
}
