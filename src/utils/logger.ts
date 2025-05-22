// src/utils/logger.ts
import { theme } from "./theme.js";

export const logger = {
  info: (message: string): void => {
    console.log(theme.info(`ℹ ${message}`));
  },
  success: (message: string): void => {
    console.log(theme.success(`✓ ${message}`));
  },
  error: (message: string): void => {
    console.error(theme.error(`✗ ${message}`));
  },
  warning: (message: string): void => {
    console.warn(theme.warning(`⚠ ${message}`));
  },
  log: (message: string): void => {
    console.log(message);
  },
  newLine: (): void => {
    console.log();
  },
};
