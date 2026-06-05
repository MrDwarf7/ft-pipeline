// pipeline.ts -- Pipeline composition and full run orchestration
//
// Key change: we OWN pipeline.db. Sync reads from X directly, writes into
// our DB. Extract/Merge/Classify/Generate all read from pipeline.db.

import { Args, getPassword } from "../types.ts";
import { runMigrate } from "../commands/migrate.ts";
import { runSync } from "../commands/sync.ts";
import { runExtract } from "../commands/extract.ts";
import { runMerge } from "../commands/merge.ts";
import { runClassify } from "../commands/classify.ts";
import { runGenerate } from "../commands/generate.ts";
import { runIndexes } from "../commands/indexes.ts";
import { createOpenAICompat } from "../llm/index.ts";
import { CONFIG } from "../config.ts";
import { logger } from "./logger.ts";

const llm = createOpenAICompat({
  baseUrl: CONFIG.llmBase,
  model: CONFIG.llmModel,
});

export const pipeline = {
  migrate: () => runMigrate(),

  sync: (args: Args) =>
    runSync(getPassword(args), {
      maxPages: args["max-pages"] ? Number(args["max-pages"]) : undefined,
      targetAdds: args["target-adds"] ? Number(args["target-adds"]) : undefined,
      maxMinutes: args["max-minutes"] ? Number(args["max-minutes"]) : undefined,
      rebuild: args.rebuild,
      continue: args.continue,
      gaps: args.gaps,
      dryRun: args["dry-run"],
    }),

  extract: (args: Args) =>
    runExtract({
      dryRun: args["dry-run"],
      limit: args.limit ? Number(args.limit) : undefined,
      skipExisting: args["skip-existing"],
    }),

  merge: (args: Args) => runMerge({ dryRun: args["dry-run"] }),

  classify: async (args: Args) => {
    const connected = await llm.check();
    return runClassify(connected, {
      dryRun: args["dry-run"],
      limit: args.limit ? Number(args.limit) : undefined,
    });
  },

  generate: () => runGenerate(),
  indexes: () => runIndexes(),
};

export const runFull = async (args: Args) => {
  const isDryRun = args["dry-run"];

  if (isDryRun) {
    logger.info("dry run — no steps will execute", {
      steps: [
        "Migrate",
        "Sync",
        "Extract",
        "Merge",
        "Classify",
        "Generate",
        "Indexes",
      ],
    });
    return;
  }

  const steps = [
    ["Migrate", pipeline.migrate],
    ["Sync", () => pipeline.sync(args)],
    ["Extract", () => pipeline.extract(args)],
    ["Merge", () => pipeline.merge(args)],
    ["Classify", () => pipeline.classify(args)],
    ["Generate", pipeline.generate],
    ["Indexes", pipeline.indexes],
  ] as const;

  const results: Array<{
    step: string;
    status: "ok" | "failed";
    error?: string;
  }> = [];

  await steps.reduce(
    (chain, [name, thunk]) =>
      chain.then(async () => {
        const stepName = String(name);
        logger.info("pipeline step", { step: stepName });
        try {
          await thunk();
          results.push({ step: stepName, status: "ok" });
          logger.info("step completed", { step: stepName });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("step failed", { step: stepName, error: msg });

          // TODO: this is disgusting.
          // We have `let` usage here we can likely avoid entirely.
          // We have chained conditionals AND chained turnary's! This could be refactored to be more data-driven.
          // We have a dead Promise.resolve() at the end we can also probably avoid if we structure correctly.

          // Attach descriptive hints so cron/LM agents know what's wrong
          const lower = msg.toLowerCase();
          let hint = "";
          if (
            lower.includes("connection refused") ||
            lower.includes("econnrefused")
          ) {
            hint = stepName === "Classify"
              ? "LLM server not running at localhost:1234. Start with: LD_LIBRARY_PATH=/opt/llama-cpp/lib /opt/llama-cpp/bin/llama-server -m <model.gguf> --port 1234"
              : "Connection refused — check the target service is running";
          } else if (
            lower.includes("connect") ||
            lower.includes("dns") ||
            lower.includes("timeout")
          ) {
            hint = stepName === "Sync"
              ? "X GraphQL API unreachable — check network or cookies may have expired"
              : stepName === "Extract"
              ? "xtracticle API unreachable — check network"
              : "Network error — check connectivity";
          } else if (lower.includes("password") || lower.includes("cookie")) {
            hint = "Check FT_COOKIES_PATH and FT_PIPELINE_PASSWORD env vars";
          } else if (lower.includes("no models")) {
            hint = "LLM server is running but has no model loaded — check llama-server model path";
          }

          if (hint) logger.error("step hint", { step: stepName, hint });
          results.push({
            step: stepName,
            status: "failed",
            error: hint ? `${msg} — ${hint}` : msg,
          });
        }
      }),
    Promise.resolve(),
  );

  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0) {
    logger.warn("pipeline completed with failures", {
      total: results.length,
      ok: results.length - failed.length,
      failed: failed.length,
      failures: failed.map((f) => `${f.step}: ${f.error}`),
    });
  } else {
    logger.info("pipeline complete");
  }
};
