// help.ts -- Help text and usage output

import { logger } from "../utils/logger.ts";

export const printScreen = (text: string): never => {
  logger.info(text);
  Deno.exit(0);
};
