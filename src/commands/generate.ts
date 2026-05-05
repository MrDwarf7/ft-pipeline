// commands/generate.ts -- Regenerate md files from DB via ft CLI

import { logger } from "../utils/logger.ts";
import { runFtCommand } from "../utils/ft-cli.ts";

export const runGenerate = async (): Promise<void> => {
  logger.info(
    "generate started — regenerating all bookmark markdown files via fieldtheory-cli",
  );

  const result = await runFtCommand(["start", "md", "--force"]);
  if (!result.success) {
    throw new Error(`ft md failed (exit ${result.code})`);
  }

  logger.info("generate complete — all bookmark markdown files updated");
};
