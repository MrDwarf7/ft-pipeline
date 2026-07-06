/** SHA-256 hashing for content comparison before writing index files */

export const hashFile = async (
  path: string,
  baseDir: string,
): Promise<string> => {
  const fullPath = path.startsWith("/") ? path : `${baseDir}/${path}`;
  const content = await Deno.readTextFile(fullPath);
  return hashContent(content);
};

export const hashContent = async (content: string): Promise<string> => {
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();

  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const hashContentSync = async (content: string): Promise<string> => {
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();

  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(content));
  const hashArray = new Uint8Array(hash);
  return Array.from(hashArray, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const hashesMatch = (hash1: string, hash2: string): boolean => {
  return hash1.toLowerCase() === hash2.toLowerCase();
};

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
