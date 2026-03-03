import { readFile } from "node:fs/promises";

import { TicketSchema, type Ticket, type TicketComment } from "@isv/domain";
import { XMLParser } from "fast-xml-parser";

import type { TicketPort } from "../port.js";

// ---------------------------------------------------------------------------
// XML parser configuration
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["item", "label", "comment", "customfield", "customfieldvalue"].includes(
      name,
    ),
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags, returning plain text. Repeats until no tags remain. */
function stripHtml(html: string): string {
  let result = html;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, "");
  } while (result !== previous);
  return result.trim();
}

/** Convert RFC 2822 date string to ISO 8601. */
function toIso8601(rfc2822: string): string {
  const date = new Date(rfc2822);
  return date.toISOString();
}

/**
 * Extract a scalar string value from a parsed XML node.
 * The node may be a plain string or an object with `#text`.
 */
function textOf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"]);
  }
  return String(node);
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

function extractStoryPoints(
  customFields: unknown[] | undefined,
): number | undefined {
  if (!Array.isArray(customFields)) return undefined;
  for (const cf of customFields) {
    if (
      typeof cf === "object" &&
      cf !== null &&
      "customfieldname" in cf &&
      String((cf as Record<string, unknown>).customfieldname) === "Story Points"
    ) {
      const values = (cf as Record<string, unknown>).customfieldvalues;
      if (
        typeof values === "object" &&
        values !== null &&
        "customfieldvalue" in values
      ) {
        const arr = (values as Record<string, unknown>).customfieldvalue;
        const raw = Array.isArray(arr) ? arr[0] : arr;
        const num = Number(raw);
        return Number.isFinite(num) ? num : undefined;
      }
    }
  }
  return undefined;
}

function extractLabels(item: Record<string, unknown>): string[] {
  const raw = item.label;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((l) => textOf(l)).filter(Boolean);
  return [textOf(raw)].filter(Boolean);
}

function extractComments(item: Record<string, unknown>): TicketComment[] {
  const raw = item.comment;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((c) => {
      if (typeof c !== "object" || c === null) return null;
      const obj = c as Record<string, unknown>;
      const author = String(obj["@_author"] ?? "");
      const body = stripHtml(textOf(obj["#text"] ?? obj));
      const createdAt = obj["@_created"]
        ? toIso8601(String(obj["@_created"]))
        : "";
      if (!author || !createdAt) return null;
      return { author, body, createdAt };
    })
    .filter((c): c is TicketComment => c !== null);
}

function extractParentId(item: Record<string, unknown>): string | undefined {
  const parent = item.parent;
  if (!parent) return undefined;
  const id = textOf(parent);
  return id || undefined;
}

function extractProjectKey(item: Record<string, unknown>): string {
  const project = item.project;
  if (typeof project === "object" && project !== null && "@_key" in project) {
    return String((project as Record<string, unknown>)["@_key"]);
  }
  return textOf(project);
}

// ---------------------------------------------------------------------------
// Item → Ticket mapping
// ---------------------------------------------------------------------------

function mapItem(item: Record<string, unknown>): Ticket | null {
  try {
    const raw = {
      ticketId: textOf(item.key),
      projectKey: extractProjectKey(item),
      type: textOf(item.type),
      status: textOf(item.status),
      title: textOf(item.summary),
      description: textOf(item.description),
      parentId: extractParentId(item),
      storyPoints: extractStoryPoints(
        item.customfields
          ? (
              (item.customfields as Record<string, unknown>)
                .customfield as unknown[]
            )
          : undefined,
      ),
      labels: extractLabels(item),
      comments: extractComments(item),
      createdAt: item.created ? toIso8601(String(item.created)) : "",
      updatedAt: item.updated ? toIso8601(String(item.updated)) : "",
    };

    const result = TicketSchema.safeParse(raw);
    if (!result.success) {
      console.warn(
        `Skipping invalid ticket item: ${raw.ticketId || "unknown"} — ${result.error.message}`,
      );
      return null;
    }
    return result.data;
  } catch (err) {
    console.warn(`Skipping malformed ticket item: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Adapter for Jira RSS/XML export files.
 *
 * Parses `<rss>` → `<channel>` → `<item>` elements and maps them to
 * the normalised `Ticket` domain schema using `fast-xml-parser`.
 */
export class JiraXmlAdapter implements TicketPort {
  async parse(filePath: string): Promise<Ticket[]> {
    const xml = await readFile(filePath, "utf-8");
    const doc = parser.parse(xml) as Record<string, unknown>;

    const rss = doc.rss as Record<string, unknown> | undefined;
    const channel = rss?.channel as Record<string, unknown> | undefined;
    if (!channel) return [];

    const items = channel.item as Record<string, unknown>[] | undefined;
    if (!Array.isArray(items)) return [];

    return items.map(mapItem).filter((t): t is Ticket => t !== null);
  }
}
