// utils/hash.ts -- SHA-256 hashing utilities for content comparison
//
// Provides functions to compute file hashes and content hashes for
// comparison before writing index files. Uses Web Crypto API for
// efficient in-memory hashing.

// ── Constants ─────────────────────────────────────────────────
// Use a reasonable chunk size for large file reading
// const CHUNK_SIZE = 65536; // 64KB chunks for file reading

// ── File hashing ──────────────────────────────────────────────

import { logger } from "./logger.ts";

/**
 * Compute SHA-256 hash of a file by reading it in chunks.
 *
 * Reads the file in 64KB chunks and accumulates the hash digest.
 * This is memory-efficient for large files.
 *
 * @param path - Absolute or relative path to the file
 * @param baseDir - Base directory to resolve relative paths against
 * @returns Promise resolving to hash string
 */
export const hashFile = async (
  path: string,
  baseDir: string,
): Promise<string> => {
  const fullPath = path.startsWith("/") ? path : `${baseDir}/${path}`;
  const file = await Deno.open(fullPath, { read: true });

  try {
    const crypto = globalThis.crypto;

    // Read entire file into ArrayBuffer using functional iterator
    const stat = file.statSync();
    const size = stat?.size ?? 0;

    if (size > 0) {
      const buffer = new Uint8Array(size);

      // TODO: wtf is this magicical number? (65536) ?? What is it? Document it by putting it into a proper constant.
      // Surely Deno has a proper function for this in it's std lib?

      // Read file in chunks using Array.from() with index
      Array.from({ length: Math.ceil(size / 65536) }, async (_, i) => {
        const offset = i * 65536;
        const chunkSize = Math.min(65536, size - offset);
        try {
          const bytesRead = await file.read(
            buffer.slice(offset, offset + chunkSize),
          );
          if (bytesRead === null) return 0;
          return bytesRead;
        } catch (err) {
          logger.error("error reading file chunk for hashing", {
            path: fullPath,
            error: String(err),
          });
        }
      });

      // Hash the buffer
      const hash = await crypto.subtle.digest("SHA-256", buffer);

      // Convert hash to hex string using functional iterator
      const bytes = hash as ArrayBuffer;
      const view = new DataView(bytes);
      const hex = Array.from(
        { length: view.byteLength },
        () => view.getUint8(0).toString(16).padStart(2, "0"),
      );
      return hex.join("");
    }

    return "";
  } finally {
    file.close();
  }
};

// ── Content hashing ────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a string (content).
 *
 * @param content - String content to hash
 * @returns Promise resolving to hash string
 */
export const hashContent = async (content: string): Promise<string> => {
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();

  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(content));

  // Convert hash to hex string using functional iterator
  const bytes = hash as ArrayBuffer;
  const view = new DataView(bytes);
  const hex = Array.from(
    { length: view.byteLength },
    () => view.getUint8(0).toString(16).padStart(2, "0"),
  );
  return hex.join("");
};

/**
 * Compute SHA-256 hash of a string (content) synchronously.
 *
 * @param content - String content to hash
 * @returns Hash string
 */
export const hashContentSync = async (content: string): Promise<string> => {
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();

  const hash = crypto.subtle.digest("SHA-256", encoder.encode(content));

  // Convert hash to hex string using functional iterator
  const bytes = (await hash) as ArrayBuffer;
  const view = new DataView(bytes);
  const hex = Array.from(
    { length: view.byteLength },
    () => view.getUint8(0).toString(16).padStart(2, "0"),
  );
  return hex.join("");
};

// ── Comparison utilities ──────────────────────────────────────

/**
 * Check if two hashes are equal.
 *
 * @param hash1 - First hash string
 * @param hash2 - Second hash string
 * @returns True if hashes match
 */
export const hashesMatch = (hash1: string, hash2: string): boolean => {
  return hash1.toLowerCase() === hash2.toLowerCase();
};

/**
 * Check if a file needs to be updated by comparing hashes.
 *
 * @param existingPath - Path to existing file on disk
 * @param baseDir - Base directory for resolving paths
 * @param newContent - New content to compare against
 * @returns Promise resolving to true if update needed
 */
export const needsUpdate = async (
  existingPath: string | null,
  baseDir: string,
  newContent: string,
): Promise<boolean> => {
  // If no existing file, always update
  if (!existingPath) {
    return true;
  }

  try {
    const existingHash = await hashFile(existingPath, baseDir);
    const newHash = await hashContent(newContent);

    return !hashesMatch(existingHash, newHash);
  } catch (error) {
    // If file doesn't exist or other error, assume update needed
    (globalThis as typeof globalThis).console?.error(
      `Error checking update for ${existingPath}:`,
      error,
    );
    return true;
  }
};
