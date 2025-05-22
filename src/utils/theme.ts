// src/utils/theme.ts
import chalk from "chalk";

export const theme = {
  primary: chalk.white,
  secondary: chalk.gray,
  accent: chalk.hex("#005288"), // SpaceX blue
  success: chalk.hex("#8BC34A"),
  error: chalk.hex("#F44336"),
  warning: chalk.hex("#FFC107"),
  info: chalk.hex("#2196F3"),

  // Text styles
  heading: (text: string): string => chalk.white.bold(text),
  subheading: (text: string): string => chalk.gray.bold(text),

  // UI elements
  prompt: (text: string): string => chalk.white(`${text} `),
  highlight: (text: string): string => chalk.hex("#005288").bold(text),

  // Message styling
  human: (text: string): string => chalk.white(text),
  bot: (text: string): string => chalk.hex("#FBCFE8")(text),
  system: (text: string): string => chalk.gray(text),
};
