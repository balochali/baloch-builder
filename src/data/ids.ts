/**
 * data/ids.ts — UUID v4 and timestamp helpers.
 * Uses the Web Crypto API (available in browser + Tauri WebView).
 * No Node.js APIs — mobile-safe.
 */

/** Generate a new UUID v4 */
export function newId(): string {
  return crypto.randomUUID();
}

/** Return current time as an ISO 8601 string */
export function now(): string {
  return new Date().toISOString();
}
