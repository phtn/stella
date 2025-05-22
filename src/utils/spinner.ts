import ora, { type Options, type Ora } from "ora";

export const createSpinner = (
  text: string,
  { spinner = "dots2" }: Options,
): Ora => {
  return ora({
    text,
    color: "blue",
    spinner,
  });
};
