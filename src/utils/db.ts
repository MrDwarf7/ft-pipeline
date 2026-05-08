// utils/db.ts -- Centralized Pipeline DB singleton
// Lazy-init, returns existing instance if already initialized.
// Call closePipelineDb() at process exit or when you explicitly need to reset.

import { Database } from "@db/sqlite";
import { CONFIG } from "../config.ts";

let instance: Database | null = null;

export const getPipelineDb = (): Database => {
  if (instance) return instance;

  instance = new Database(CONFIG.pipelineDbPath);
  instance.exec("PRAGMA journal_mode=WAL");
  return instance;
};

export const closePipelineDb = (): void => {
  if (!instance) return;
  instance.close();
  instance = null;
};

export type { Database };
