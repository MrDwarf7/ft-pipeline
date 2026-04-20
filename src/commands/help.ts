// help.ts -- Help text and usage output

import { logger } from "../utils/logger.ts";
import { generateHelpText } from "../cli-schema.ts";

export const printHelp = () => {
  logger.info(generateHelpText());
  Deno.exit(0);
};
