/** Hash-aware writes for index pages. */

import { CONFIG } from "../../config.ts";
import { logger } from "../../utils/logger.ts";
import { needsUpdate } from "../../utils/hash.ts";
import { ENTITY_THRESHOLD } from "./view.ts";
import {
  renderCategoryPage,
  renderDomainPage,
  renderEntityPage,
  renderMasterIndex,
} from "./render.ts";
import type { BookmarkEntry, IndexGroups } from "./types.ts";

interface WriteTarget {
  outputPath: string;
  existingPath: string;
  baseDir: string;
  content: string;
  updatedLog: { msg: string; fields: Record<string, unknown> };
  skippedLog: { msg: string; fields: Record<string, unknown> };
}

/** Write content only when SHA-256 differs from the existing file. */
const writeIfChanged = async (target: WriteTarget): Promise<void> => {
  const needsUpdateResult = await needsUpdate(
    target.existingPath,
    target.baseDir,
    target.content,
  );

  if (needsUpdateResult) {
    await Deno.writeTextFile(target.outputPath, target.content);
    logger.info(target.updatedLog.msg, target.updatedLog.fields);
  } else {
    logger.debug(target.skippedLog.msg, target.skippedLog.fields);
  }
};

const writeCategoryPages = async (
  byCategory: Record<string, BookmarkEntry[]>,
): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/categories`;
  await Deno.mkdir(dir, { recursive: true });
  const updatedAt = new Date().toISOString();

  await Promise.all(
    Object.entries(byCategory).map(async ([category, entries]) => {
      const content = renderCategoryPage(category, entries, updatedAt);
      const outputPath = `${dir}/${category}.md`;

      await writeIfChanged({
        outputPath,
        existingPath: outputPath,
        baseDir: dir,
        content,
        updatedLog: {
          msg: "category index updated",
          fields: { category, count: entries.length, path: outputPath },
        },
        skippedLog: {
          msg: "category index unchanged (hash match)",
          fields: { category, count: entries.length, path: outputPath },
        },
      });
    }),
  );
};

const writeDomainPages = async (
  byDomain: Record<string, BookmarkEntry[]>,
): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/domains`;
  await Deno.mkdir(dir, { recursive: true });
  const updatedAt = new Date().toISOString();

  await Promise.all(
    Object.entries(byDomain).map(async ([domain, entries]) => {
      const content = renderDomainPage(domain, entries, updatedAt);
      const outputPath = `${dir}/${domain}.md`;

      await writeIfChanged({
        outputPath,
        existingPath: outputPath,
        baseDir: dir,
        content,
        updatedLog: {
          msg: "domain index updated",
          fields: { domain, count: entries.length, path: outputPath },
        },
        skippedLog: {
          msg: "domain index unchanged (hash match)",
          fields: { domain, count: entries.length, path: outputPath },
        },
      });
    }),
  );
};

const writeEntityPages = async (
  byAuthor: Record<string, BookmarkEntry[]>,
): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/entities`;
  await Deno.mkdir(dir, { recursive: true });
  const updatedAt = new Date().toISOString();

  await Promise.all(
    Object.entries(byAuthor).map(async ([handle, entries]) => {
      if (entries.length < ENTITY_THRESHOLD) return;

      const content = renderEntityPage(handle, entries, updatedAt);
      const outputPath = `${dir}/${handle}.md`;

      await writeIfChanged({
        outputPath,
        existingPath: outputPath,
        baseDir: dir,
        content,
        updatedLog: {
          msg: "entity page updated",
          fields: { handle, count: entries.length, path: outputPath },
        },
        skippedLog: {
          msg: "entity page unchanged (hash match)",
          fields: { handle, count: entries.length, path: outputPath },
        },
      });
    }),
  );
};

const writeMasterIndex = async (
  totalBookmarks: number,
  groups: IndexGroups,
): Promise<void> => {
  const updatedAt = new Date().toISOString();
  const content = renderMasterIndex(
    totalBookmarks,
    groups.byCategory,
    groups.byDomain,
    groups.byAuthor,
    updatedAt,
  );

  const outputPath = `${CONFIG.mdOutputDir}/index.md`;

  await writeIfChanged({
    outputPath,
    existingPath: outputPath,
    baseDir: CONFIG.mdOutputDir,
    content,
    updatedLog: {
      msg: "master index updated",
      fields: { path: outputPath },
    },
    skippedLog: {
      msg: "master index unchanged (hash match)",
      fields: { path: outputPath },
    },
  });
};

/** Write category, domain, entity, and master index pages with hash skip. */
export const writeAllIndexes = async (
  totalBookmarks: number,
  groups: IndexGroups,
): Promise<void> => {
  await writeCategoryPages(groups.byCategory);
  await writeDomainPages(groups.byDomain);
  await writeEntityPages(groups.byAuthor);
  await writeMasterIndex(totalBookmarks, groups);
};
