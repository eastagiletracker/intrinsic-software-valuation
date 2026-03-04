import { describe, it, expect } from "vitest";
import type { HealthScores } from "@isv/domain";

import { deriveC2, aggregateC2 } from "./c2-derivation.js";

/** Helper to build HealthScores with overrides. */
function makeHealthScores(
  overrides: Partial<{
    avgCyclomaticComplexity: number;
    duplicationPercentage: number;
    coveragePercentage: number | undefined;
    godClassCount: number;
  }> = {},
): HealthScores {
  return {
    complexity: {
      avgCyclomaticComplexity: overrides.avgCyclomaticComplexity ?? 2,
      duplicationPercentage: overrides.duplicationPercentage ?? 1,
      godClassCount: overrides.godClassCount ?? 0,
    },
    testHealth: {
      coveragePercentage:
        "coveragePercentage" in overrides
          ? overrides.coveragePercentage
          : 80,
      outdatedDependencies: 0,
      deadCodeFiles: 0,
    },
  };
}

describe("C2 Derivation", () => {
  // -----------------------------------------------------------------------
  // Penalty sum → C2 mapping
  // -----------------------------------------------------------------------

  describe("penalty sum thresholds", () => {
    it("penalty 0 → C2=1 (all metrics clean)", () => {
      // complexity <5, dup <5, coverage ≥70, gods <5 → 0+0+0+0 = 0
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 3,
        duplicationPercentage: 2,
        coveragePercentage: 85,
        godClassCount: 0,
      });
      expect(deriveC2(hs)).toBe(1);
    });

    it("penalty 1 → C2=1", () => {
      // complexity 5–15 → 1, rest clean → 0+0+0 = 1
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 10,
        duplicationPercentage: 2,
        coveragePercentage: 85,
        godClassCount: 0,
      });
      expect(deriveC2(hs)).toBe(1);
    });

    it("penalty 2 → C2=2", () => {
      // complexity 5–15 → 1, dup 5–20 → 1, rest clean → 2
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 10,
        duplicationPercentage: 10,
        coveragePercentage: 85,
        godClassCount: 0,
      });
      expect(deriveC2(hs)).toBe(2);
    });

    it("penalty 4 → C2=2", () => {
      // complexity >15 → 2, dup 5–20 → 1, coverage 40–70 → 1, gods <5 → 0 = 4
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 20,
        duplicationPercentage: 15,
        coveragePercentage: 50,
        godClassCount: 3,
      });
      expect(deriveC2(hs)).toBe(2);
    });

    it("penalty 5 → C2=3", () => {
      // complexity >15 → 2, dup >20 → 2, coverage 40–70 → 1, gods <5 → 0 = 5
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 20,
        duplicationPercentage: 25,
        coveragePercentage: 50,
        godClassCount: 2,
      });
      expect(deriveC2(hs)).toBe(3);
    });

    it("penalty 7 (maximum) → C2=3", () => {
      // all max: 2+2+2+1 = 7
      const hs = makeHealthScores({
        avgCyclomaticComplexity: 30,
        duplicationPercentage: 40,
        coveragePercentage: 20,
        godClassCount: 10,
      });
      expect(deriveC2(hs)).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Individual metric boundary tests
  // -----------------------------------------------------------------------

  describe("cyclomatic complexity boundaries", () => {
    it("<5 → penalty 0", () => {
      expect(deriveC2(makeHealthScores({ avgCyclomaticComplexity: 4.9 }))).toBe(1);
    });
    it("=5 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ avgCyclomaticComplexity: 5 }))).toBe(1);
    });
    it("=15 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ avgCyclomaticComplexity: 15 }))).toBe(1);
    });
    it(">15 → penalty 2", () => {
      expect(deriveC2(makeHealthScores({ avgCyclomaticComplexity: 15.1 }))).toBe(2);
    });
  });

  describe("duplication boundaries", () => {
    it("<5 → penalty 0", () => {
      expect(deriveC2(makeHealthScores({ duplicationPercentage: 4.9 }))).toBe(1);
    });
    it("=5 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ duplicationPercentage: 5 }))).toBe(1);
    });
    it("=20 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ duplicationPercentage: 20 }))).toBe(1);
    });
    it(">20 → penalty 2", () => {
      expect(deriveC2(makeHealthScores({ duplicationPercentage: 20.1 }))).toBe(2);
    });
  });

  describe("coverage boundaries", () => {
    it("≥70 → penalty 0", () => {
      expect(deriveC2(makeHealthScores({ coveragePercentage: 70 }))).toBe(1);
    });
    it("40–70 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ coveragePercentage: 40 }))).toBe(1);
    });
    it("<40 → penalty 2", () => {
      expect(deriveC2(makeHealthScores({ coveragePercentage: 39.9 }))).toBe(2);
    });
    it("undefined (unknown) → penalty 2", () => {
      expect(deriveC2(makeHealthScores({ coveragePercentage: undefined }))).toBe(2);
    });
  });

  describe("god class boundaries", () => {
    it("<5 → penalty 0", () => {
      expect(deriveC2(makeHealthScores({ godClassCount: 4 }))).toBe(1);
    });
    it("≥5 → penalty 1", () => {
      expect(deriveC2(makeHealthScores({ godClassCount: 5 }))).toBe(1);
    });
  });
});

describe("C2 Aggregation", () => {
  it("single repo returns its C2", () => {
    expect(aggregateC2([2])).toBe(2);
  });

  it("multiple repos returns max C2", () => {
    expect(aggregateC2([1, 2, 3])).toBe(3);
    expect(aggregateC2([1, 1, 1])).toBe(1);
    expect(aggregateC2([2, 3, 1])).toBe(3);
  });

  it("throws on empty input", () => {
    expect(() => aggregateC2([])).toThrow("at least one");
  });
});
