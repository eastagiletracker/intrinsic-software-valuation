import { describe, it, expect } from "vitest";
import type { IsvFactors, HealthScores } from "@isv/domain";

import { createValuationService } from "./factory.js";

const valuation = createValuationService();

describe("QG-2 — Formula Correctness Gate", () => {
  // -----------------------------------------------------------------------
  // Case-study scenarios → exact ISV scores
  // -----------------------------------------------------------------------

  describe("case-study scenarios produce exact ISV scores", () => {
    it("React Component → ISV=4", () => {
      const result = valuation.calculate("CASE-REACT", {
        A1_Data: 1,
        A2_UX: 3,
        B1_Logic: 1,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      });

      expect(result.isvScore).toBe(4);
      expect(result.formulaVersion).toBe("3.4");
      expect(result.breakdown.poValue).toBe(4);
      expect(result.breakdown.archFactor).toBe(1);
      expect(result.breakdown.qualityMultiplier).toBe(1);
    });

    it("Salesforce Integration → ISV=70", () => {
      const result = valuation.calculate("CASE-SF", {
        A1_Data: 2,
        A2_UX: 2,
        B1_Logic: 3,
        C1_Integration: 5,
        C2_State: 2,
        D3_Quality: 1,
      });

      expect(result.isvScore).toBe(70);
    });

    it("Database Migration → ISV=8", () => {
      const result = valuation.calculate("CASE-DB", {
        A1_Data: 5,
        A2_UX: 1,
        B1_Logic: 3,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      });

      expect(result.isvScore).toBe(8);
    });

    it("Bugfix in Toxic Legacy → ISV=6", () => {
      const result = valuation.calculate("CASE-BUGFIX", {
        A1_Data: 1,
        A2_UX: 2,
        B1_Logic: 0,
        C1_Integration: 1,
        C2_State: 3,
        D3_Quality: 1,
      });

      expect(result.isvScore).toBe(6);
    });
  });

  // -----------------------------------------------------------------------
  // C2 derivation boundary tests
  // -----------------------------------------------------------------------

  describe("C2 derivation boundary transitions", () => {
    function makeHealthScores(overrides: {
      avgCyclomaticComplexity?: number;
      duplicationPercentage?: number;
      coveragePercentage?: number;
      godClassCount?: number;
    }): HealthScores {
      return {
        complexity: {
          avgCyclomaticComplexity: overrides.avgCyclomaticComplexity ?? 2,
          duplicationPercentage: overrides.duplicationPercentage ?? 1,
          godClassCount: overrides.godClassCount ?? 0,
        },
        testHealth: {
          coveragePercentage: overrides.coveragePercentage ?? 80,
          outdatedDependencies: 0,
          deadCodeFiles: 0,
        },
      };
    }

    it("clean codebase → C2=1", () => {
      expect(
        valuation.deriveC2(
          makeHealthScores({
            avgCyclomaticComplexity: 3,
            duplicationPercentage: 2,
            coveragePercentage: 85,
            godClassCount: 0,
          }),
        ),
      ).toBe(1);
    });

    it("moderate debt → C2=2", () => {
      expect(
        valuation.deriveC2(
          makeHealthScores({
            avgCyclomaticComplexity: 10,
            duplicationPercentage: 10,
            coveragePercentage: 85,
            godClassCount: 0,
          }),
        ),
      ).toBe(2);
    });

    it("toxic legacy → C2=3", () => {
      expect(
        valuation.deriveC2(
          makeHealthScores({
            avgCyclomaticComplexity: 30,
            duplicationPercentage: 40,
            coveragePercentage: 20,
            godClassCount: 10,
          }),
        ),
      ).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // D3 floor from ProjectConfig
  // -----------------------------------------------------------------------

  describe("D3 floor from ProjectConfig", () => {
    it("ticket D3 is respected — D3=2 amplifies ISV", () => {
      const base: IsvFactors = {
        A1_Data: 1,
        A2_UX: 3,
        B1_Logic: 1,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      };
      const elevated: IsvFactors = { ...base, D3_Quality: 2 };

      const baseResult = valuation.calculate("T-BASE", base);
      const elevatedResult = valuation.calculate("T-ELEVATED", elevated);

      expect(baseResult.isvScore).toBe(4);
      expect(elevatedResult.isvScore).toBe(8);
      expect(elevatedResult.isvScore).toBe(baseResult.isvScore * 2);
    });

    it("D3=3 (regulatory) triples the base ISV", () => {
      const factors: IsvFactors = {
        A1_Data: 2,
        A2_UX: 2,
        B1_Logic: 3,
        C1_Integration: 5,
        C2_State: 2,
        D3_Quality: 3,
      };
      const result = valuation.calculate("T-REG", factors);
      expect(result.isvScore).toBe(210); // 70 * 3
    });
  });

  // -----------------------------------------------------------------------
  // Formula consistency
  // -----------------------------------------------------------------------

  describe("formula consistency", () => {
    it("isvScore === poValue × archFactor × qualityMultiplier", () => {
      const factors: IsvFactors = {
        A1_Data: 3,
        A2_UX: 2,
        B1_Logic: 5,
        C1_Integration: 3,
        C2_State: 2,
        D3_Quality: 2,
      };
      const result = valuation.calculate("T-CHECK", factors);
      expect(result.isvScore).toBe(
        result.breakdown.poValue *
          result.breakdown.archFactor *
          result.breakdown.qualityMultiplier,
      );
    });
  });
});
