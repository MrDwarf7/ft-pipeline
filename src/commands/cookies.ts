// commands/cookies.ts -- Cookie extraction + encrypted storage

import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";

interface CookieData {
  ct0: string;
  authToken: string;
  extractedAt: string;
}

export const checkCookies = async (): Promise<boolean> => {
  try {
    await Deno.stat(CONFIG.cookiesPath);
    return true;
  } catch {
    return false;
  }
};

export const runCookieExtract = async (): Promise<void> => {
  logger.info("cookie extraction started");
  logger.info("go to x.com, open DevTools -> Application -> Cookies, copy ct0 value");

  const ct0 = prompt("ct0 value:");
  if (!ct0) {
    logger.error("aborted");
    return;
  }

  logger.info("copy the auth_token cookie value");
  const authToken = prompt("auth_token value:");
  if (!authToken) {
    logger.error("aborted");
    return;
  }

  logger.info("set an encryption password for the cookie file");
  const password = prompt("Password:");
  if (!password) {
    logger.error("aborted");
    return;
  }

  const confirm = prompt("Confirm password:");
  if (password !== confirm) {
    logger.error("passwords don't match");
    return;
  }

  const data: CookieData = {
    ct0,
    authToken,
    extractedAt: new Date().toISOString(),
  };

  const encrypted = await encrypt(JSON.stringify(data), password);
  await Deno.writeTextFile(CONFIG.cookiesPath, encrypted);
  logger.info("cookies saved", { path: CONFIG.cookiesPath });
};

export const getCookies = async (password: string): Promise<CookieData> => {
  const encrypted = await Deno.readTextFile(CONFIG.cookiesPath);
  const decrypted = await decrypt(encrypted, password);
  const data = JSON.parse(decrypted);
  logger.info("cookies loaded", { extractedAt: data.extractedAt });
  return data;
};

// AES-GCM encryption
const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100_000;

const deriveKey = async (password: string, salt: BufferSource): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const encrypt = async (plaintext: string, password: string): Promise<string> => {
  const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(SALT_LEN)));
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(IV_LEN)));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
};

const decrypt = async (encoded: string, password: string): Promise<string> => {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, SALT_LEN);
  const iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = combined.slice(SALT_LEN + IV_LEN);

  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
};
