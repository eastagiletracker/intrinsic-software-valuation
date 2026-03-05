import { createHash } from "node:crypto";

/**
 * Build a deterministic, filesystem-safe cache key from call metadata.
 *
 * The key encodes the client name, method name, and a canonical hash of
 * the parameters object. Identical parameters in different object-key
 * order produce the **same** key. `undefined` values are stripped so that
 * missing and explicitly-undefined parameters are treated equivalently.
 *
 * Returned path segment: `<client>/<method>/<paramHash>`
 *
 * @param client - Client name, e.g. "jira", "git".
 * @param method - Method name, e.g. "getTickets", "logStats".
 * @param params - Parameters to hash. Supports nested objects and arrays.
 * @returns A filesystem-safe relative path segment (forward slashes, no extension).
 */
export function buildCacheKey(
  client: string,
  method: string,
  params: Record<string, unknown>,
): string {
  const slug = canonicalSlug(params);
  return `${sanitize(client)}/${sanitize(method)}/${slug}`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Produce a short, deterministic slug from an arbitrary params object.
 *
 * Strategy: canonical JSON → SHA-256 → first 12 hex chars. This is short
 * enough to be human-friendly in file listings while virtually collision-free.
 */
function canonicalSlug(params: Record<string, unknown>): string {
  const json = canonicalJson(params);
  if (json === "{}") return "none";
  const hash = createHash("sha256").update(json).digest("hex");
  return hash.slice(0, 12);
}

/**
 * Canonical JSON: sorted keys, `undefined` values stripped, deterministic.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return undefined; // strip undefined
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      // Sort object keys for deterministic output
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

/** Replace anything that is not alphanumeric, dash, or underscore. */
function sanitize(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}
