import { describe, expect, it } from "vitest";

import {
  classifyAttribution,
  extractTicketIds,
  parseDateToIso,
} from "./adapter.js";

// ---------------------------------------------------------------------------
// parseDateToIso
// ---------------------------------------------------------------------------

describe("parseDateToIso", () => {
  it("parses Teamleader DD-MM-YYYY format", () => {
    expect(parseDateToIso("01-03-2025")).toBe("2025-03-01T00:00:00.000Z");
  });

  it("parses a Date object", () => {
    const d = new Date("2025-06-15T00:00:00Z");
    expect(parseDateToIso(d)).toBe(d.toISOString());
  });

  it("parses an ISO string fallback", () => {
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
    expect(extractTicketIds("Daily, Code Review")).toEqual([]);
  });

  it("detects a single plain ticket ID", () => {
    expect(extractTicketIds("Worked on UNICEF-18933")).toEqual(["UNICEF-18933"]);
  });

  it("detects multiple plain ticket IDs", () => {
    const ids = extractTicketIds(
      "daily, UNICEF-18811, UNICEF-18635, Störung wegen abgelaufenem Zertifikat",
    );
    expect(ids).toContain("UNICEF-18811");
    expect(ids).toContain("UNICEF-18635");
    expect(ids).toHaveLength(2);
  });

  it("detects ticket ID from Jira browse URL", () => {
    const ids = extractTicketIds(
      "See https://bitgrip.atlassian.net/browse/UNICEF-18927 for details",
    );
    expect(ids).toContain("UNICEF-18927");
  });

  it("deduplicates IDs that appear via URL and plain form", () => {
    const ids = extractTicketIds(
      "https://bitgrip.atlassian.net/browse/UNICEF-18927 UNICEF-18927",
    );
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("UNICEF-18927");
  });

  it("deduplicates the same ID appearing twice in plain form", () => {
    const ids = extractTicketIds("BANTZ-2193 and again BANTZ-2193");
    expect(ids).toHaveLength(1);
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
