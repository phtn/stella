// src/utils/spinner.ts
import ora from "ora";
import { theme } from "./theme.js";

export const createSpinner = (text: string) => {
  return ora({
    text,
    color: "blue",
    spinner: "dots2",
  });
};
