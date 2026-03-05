import { describe, expect, it } from "vitest";

import {
  cellToString,
  classifyAttribution,
  extractTicketIds,
  parseDateToIso,
} from "./adapter.js";

// ---------------------------------------------------------------------------
// parseDateToIso
// ---------------------------------------------------------------------------

describe("parseDateToIso", () => {
  it("parses a Date object", () => {
    const d = new Date("2025-03-15T00:00:00Z");
    expect(parseDateToIso(d)).toBe(d.toISOString());
  });

  it("parses an ISO string", () => {
    expect(parseDateToIso("2025-03-01")).toBe("2025-03-01T00:00:00.000Z");
  });

  it("parses an Excel serial date number", () => {
    // Excel serial 45717 maps to 2025-03-01
    const result = parseDateToIso(45717);
    expect(result).toMatch(/^2025-03-01/);
  });

  it("throws for unrecognisable input", () => {
    expect(() => parseDateToIso("not-a-date")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// extractTicketIds
// ---------------------------------------------------------------------------

describe("extractTicketIds", () => {
  it("returns empty array when no IDs present", () => {
    expect(extractTicketIds("daily standup")).toEqual([]);
  });

  it("detects a single plain ticket ID", () => {
    expect(extractTicketIds("UNICEF-17981: Release Sprint")).toEqual([
      "UNICEF-17981",
    ]);
  });

  it("detects multiple plain ticket IDs (comma-separated)", () => {
    const ids = extractTicketIds(
      "UNICEF-17983, UNICEF-17967, UNICEF-17957",
    );
    expect(ids).toContain("UNICEF-17983");
    expect(ids).toContain("UNICEF-17967");
    expect(ids).toContain("UNICEF-17957");
    expect(ids).toHaveLength(3);
  });

  it("detects ticket ID from Jira browse URL", () => {
    const ids = extractTicketIds(
      "See https://acme.atlassian.net/browse/ACME-101 for details",
    );
    expect(ids).toContain("ACME-101");
  });

  it("deduplicates IDs that appear via URL and plain form", () => {
    const ids = extractTicketIds(
      "https://acme.atlassian.net/browse/ACME-101 ACME-101",
    );
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("ACME-101");
  });

  it("handles an empty description", () => {
    expect(extractTicketIds("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// classifyAttribution
// ---------------------------------------------------------------------------

describe("classifyAttribution", () => {
  it("classifies 0 IDs as KBV", () => {
    expect(classifyAttribution(0)).toBe("KBV");
  });

  it("classifies 1 ID as DIRECT", () => {
    expect(classifyAttribution(1)).toBe("DIRECT");
  });

  it("classifies 2 IDs as MULTI_ID_SPLIT", () => {
    expect(classifyAttribution(2)).toBe("MULTI_ID_SPLIT");
  });

  it("classifies 3 IDs as MULTI_ID_SPLIT", () => {
    expect(classifyAttribution(3)).toBe("MULTI_ID_SPLIT");
  });

  it("classifies 4 IDs as UNLINKED_OVERHEAD", () => {
    expect(classifyAttribution(4)).toBe("UNLINKED_OVERHEAD");
  });

  it("classifies many IDs as UNLINKED_OVERHEAD", () => {
    expect(classifyAttribution(10)).toBe("UNLINKED_OVERHEAD");
  });
});

// ---------------------------------------------------------------------------
// cellToString
// ---------------------------------------------------------------------------

describe("cellToString", () => {
  it("returns empty string for null", () => {
    expect(cellToString(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(cellToString(undefined)).toBe("");
  });

  it("extracts text from rich-text objects", () => {
    const richText = {
      richText: [
        { text: "Doe" },
        { font: { color: { argb: "FF808080" } }, text: ", Jane" },
      ],
    };
    expect(cellToString(richText)).toBe("Doe, Jane");
  });

  it("converts Date to ISO string", () => {
    const d = new Date("2025-03-15T00:00:00Z");
    expect(cellToString(d)).toBe(d.toISOString());
  });

  it("converts plain strings", () => {
    expect(cellToString("hello")).toBe("hello");
  });

  it("converts numbers to strings", () => {
    expect(cellToString(42)).toBe("42");
  });
});
