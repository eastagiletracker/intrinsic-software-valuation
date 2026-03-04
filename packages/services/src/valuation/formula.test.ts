import { describe, it, expect } from "vitest";

import {
  calculateBreakdown,
  calculateIsvScore,
  FORMULA_VERSION,
} from "./formula.js";
import type { IsvFactors } from "@isv/domain";

describe("ISV Formula (v3.4)", () => {
  it("exposes formula version 3.4", () => {
    expect(FORMULA_VERSION).toBe("3.4");
  });

  // -----------------------------------------------------------------------
  // Case studies from concept doc
  // -----------------------------------------------------------------------

  describe("case studies", () => {
    it("React Component: A1=1, A2=3, B1=1, C1=1, C2=1, D3=1 → ISV=4", () => {
      const factors: IsvFactors = {
        A1_Data: 1,
        A2_UX: 3,
        B1_Logic: 1,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(4); // (1*3)+1
      expect(breakdown.archFactor).toBe(1); // 1*1
      expect(breakdown.qualityMultiplier).toBe(1);
      expect(score).toBe(4);
    });

    it("Salesforce Integration: A1=2, A2=2, B1=3, C1=5, C2=2, D3=1 → ISV=70", () => {
      const factors: IsvFactors = {
        A1_Data: 2,
        A2_UX: 2,
        B1_Logic: 3,
        C1_Integration: 5,
        C2_State: 2,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(7); // (2*2)+3
      expect(breakdown.archFactor).toBe(10); // 5*2
      expect(breakdown.qualityMultiplier).toBe(1);
      expect(score).toBe(70);
    });

    it("Database Migration: A1=5, A2=1, B1=3, C1=1, C2=1, D3=1 → ISV=8", () => {
      const factors: IsvFactors = {
        A1_Data: 5,
        A2_UX: 1,
        B1_Logic: 3,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(8); // (5*1)+3
      expect(breakdown.archFactor).toBe(1); // 1*1
      expect(breakdown.qualityMultiplier).toBe(1);
      expect(score).toBe(8);
    });

    it("Bugfix in Toxic Legacy: A1=1, A2=2, B1=0, C1=1, C2=3, D3=1 → ISV=6", () => {
      const factors: IsvFactors = {
        A1_Data: 1,
        A2_UX: 2,
        B1_Logic: 0,
        C1_Integration: 1,
        C2_State: 3,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(2); // (1*2)+0
      expect(breakdown.archFactor).toBe(3); // 1*3
      expect(breakdown.qualityMultiplier).toBe(1);
      expect(score).toBe(6);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("all factors at minimum → ISV=1", () => {
      const factors: IsvFactors = {
        A1_Data: 1,
        A2_UX: 1,
        B1_Logic: 0,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(1); // (1*1)+0
      expect(score).toBe(1);
    });

    it("all factors at maximum → ISV=1035", () => {
      const factors: IsvFactors = {
        A1_Data: 5,
        A2_UX: 3,
        B1_Logic: 8,
        C1_Integration: 5,
        C2_State: 3,
        D3_Quality: 3,
      };
      const breakdown = calculateBreakdown(factors);
      const score = calculateIsvScore(breakdown);

      expect(breakdown.poValue).toBe(23); // (5*3)+8
      expect(breakdown.archFactor).toBe(15); // 5*3
      expect(breakdown.qualityMultiplier).toBe(3);
      expect(score).toBe(1035);
    });

    it("B1=0 means logic adds nothing to PO value", () => {
      const factors: IsvFactors = {
        A1_Data: 3,
        A2_UX: 2,
        B1_Logic: 0,
        C1_Integration: 1,
        C2_State: 1,
        D3_Quality: 1,
      };
      const breakdown = calculateBreakdown(factors);
      expect(breakdown.poValue).toBe(6); // (3*2)+0
    });
  });
});
