// commands/generate.ts -- Regenerate md files from DB via ft CLI

import { logger } from "../utils/logger.ts";

export const runGenerate = async (): Promise<void> => {
  logger.info("generate started — regenerating all bookmark markdown files via fieldtheory-cli");

  const ftDir = `${Deno.env.get("HOME")}/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`;
  const cmd = new Deno.Command("pnpm", {
    args: ["start", "md", "--force"],
    cwd: ftDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const result = await cmd.output();
  if (!result.success) {
    throw new Error(`ft md failed (exit ${result.code})`);
  }

  logger.info("generate complete — all bookmark markdown files updated");
};
