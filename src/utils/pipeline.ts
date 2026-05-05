// pipeline.ts -- Pipeline composition and full run orchestration
//
// Key change: we READ from ft's bookmarks.db but WRITE to our own pipeline.db.
// Migrate creates our schema. Sync copies from ft DB into ours.

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

  await steps.reduce(
    (chain, [name, thunk], index) =>
      chain.then(async () => {
        logger.info("pipeline step", {
          step: name,
          index: index + 1,
          total: steps.length,
        });
        await thunk();
      }),
    Promise.resolve(),
  );

  logger.info("pipeline complete");
};
