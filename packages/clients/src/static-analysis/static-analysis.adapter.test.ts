import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { parseSccOutput } from "./scc-adapter.js";
import { parseJscpdOutput } from "./jscpd-adapter.js";
import { parseKnipOutput } from "./knip-adapter.js";

const fixturesDir = resolve(import.meta.dirname, "__fixtures__");

describe("scc adapter", () => {
  const fixture = readFileSync(
    resolve(fixturesDir, "scc-output.json"),
    "utf-8",
  );

  it("parses totalLinesOfCode from Code fields", () => {
    const result = parseSccOutput(fixture);
    // 9800 (TS) + 2600 (JS) + 800 (JSON) = 13200
    expect(result.totalLinesOfCode).toBe(13200);
  });

  it("parses totalFiles from Count fields", () => {
    const result = parseSccOutput(fixture);
    // 120 + 45 + 15 = 180
    expect(result.totalFiles).toBe(180);
  });

  it("calculates avgCyclomaticComplexity", () => {
    const result = parseSccOutput(fixture);
    // (450 + 180 + 0) / 180 = 3.5
    expect(result.avgCyclomaticComplexity).toBeCloseTo(3.5, 1);
  });

  it("counts god classes from files with >1000 LOC", () => {
    const result = parseSccOutput(fixture);
    // Fixture has no individual file details → 0
    expect(result.godClassCount).toBe(0);
  });

  it("handles empty input", () => {
    const result = parseSccOutput("[]");
    expect(result.totalLinesOfCode).toBe(0);
    expect(result.totalFiles).toBe(0);
    expect(result.avgCyclomaticComplexity).toBe(0);
    expect(result.godClassCount).toBe(0);
  });
});

describe("jscpd adapter", () => {
  const fixture = readFileSync(
    resolve(fixturesDir, "jscpd-output.json"),
    "utf-8",
  );

  it("parses duplicationPercentage", () => {
    const result = parseJscpdOutput(fixture);
    expect(result.duplicationPercentage).toBe(5.0);
  });
});

describe("knip adapter", () => {
  const fixture = readFileSync(
    resolve(fixturesDir, "knip-output.json"),
    "utf-8",
  );

  it("parses deadCodeFiles count", () => {
    const result = parseKnipOutput(fixture);
    expect(result.deadCodeFiles).toBe(3);
  });

  it("handles empty files array", () => {
    const result = parseKnipOutput(JSON.stringify({ files: [] }));
    expect(result.deadCodeFiles).toBe(0);
  });
});
