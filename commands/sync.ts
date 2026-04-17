// commands/sync.ts -- Sync bookmarks from X via ft CLI

import { checkCookies, getCookies } from "./cookies.ts";
import { logger } from "../utils/logger.ts";

interface SyncOptions {
  maxPages?: number;
  targetAdds?: number;
  maxMinutes?: number;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
}

export const runSync = async (
  password: string | undefined,
  options: SyncOptions,
): Promise<void> => {
  logger.info("sync started");

  const hasCookies = await checkCookies();
  if (!hasCookies) {
    throw new Error("No cookies file. Run: ft-pipeline cookies extract");
  }

  if (!password) {
    throw new Error("Password required (use --password or FT_PIPELINE_PASSWORD env)");
  }

  logger.info("decrypting X session cookies");
  const cookies = await getCookies(password);

  const args = ["start", "sync", "--cookies", cookies.ct0, cookies.authToken, "--yes"];

  if (options.maxPages) args.push("--max-pages", String(options.maxPages));
  if (options.targetAdds) args.push("--target-adds", String(options.targetAdds));
  if (options.maxMinutes) args.push("--max-minutes", String(options.maxMinutes));
  if (options.rebuild) args.push("--rebuild");
  if (options.continue) args.push("--continue");
  if (options.gaps) args.push("--gaps");

  logger.info("running ft CLI sync", {
    maxPages: options.maxPages ?? "none",
    targetAdds: options.targetAdds ?? "none",
    maxMinutes: options.maxMinutes ?? "none",
    rebuild: options.rebuild ?? false,
  });

  const ftDir = `${Deno.env.get("HOME")}/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`;
  const cmd = new Deno.Command("pnpm", {
    args,
    cwd: ftDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const result = await cmd.output();
  if (!result.success) {
    throw new Error(`ft sync failed (exit ${result.code})`);
  }

  logger.info("sync complete — bookmarks updated from X");
};
