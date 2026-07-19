/** Help text and usage output. */
import { logBlock } from "../utils/logger.ts";

export const printScreen = (text: string): never => {
  logBlock(text);
  Deno.exit(0);
};
