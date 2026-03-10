import { describe, it, expect } from "vitest";
import type { Ticket, TimeEntry, ShipUnitCluster } from "@isv/domain";

import {
  clusterTickets,
  attributeTime,
  calculateDqs,
  linearRegression,
} from "./service.js";
import { createCalibrationService } from "./service.js";

// ---------------------------------------------------------------------------
// Ticket clustering tests
// ---------------------------------------------------------------------------

const parentTicket: Ticket = {
  ticketId: "PROJ-1",
  projectKey: "PROJ",
  type: "Story",
  status: "Done",
  title: "Parent story",
  description: "Parent story description",
  labels: [],
  comments: [],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-02-01T00:00:00.000Z",
};

const subtask1: Ticket = {
  ...parentTicket,
  ticketId: "PROJ-2",
  type: "Subtask",
  title: "Subtask 1",
  parentId: "PROJ-1",
};

const subtask2: Ticket = {
  ...parentTicket,
  ticketId: "PROJ-3",
  type: "Subtask",
  title: "Subtask 2",
  parentId: "PROJ-1",
};

const standaloneTicket: Ticket = {
  ...parentTicket,
  ticketId: "PROJ-10",
  title: "Standalone task",
};

describe("Calibration Service — boundary test", () => {
  describe("ticket clustering", () => {
    it("groups parent + subtasks into one cluster", () => {
      const clusters = clusterTickets([parentTicket, subtask1, subtask2]);
      expect(clusters.size).toBe(1);
      expect(clusters.get("PROJ-1")).toHaveLength(3);
    });

    it("creates separate cluster for standalone tickets", () => {
      const clusters = clusterTickets([
        parentTicket,
        subtask1,
        standaloneTicket,
      ]);
      expect(clusters.size).toBe(2);
      expect(clusters.get("PROJ-1")).toHaveLength(2);
      expect(clusters.get("PROJ-10")).toHaveLength(1);
    });

    it("handles empty input", () => {
      const clusters = clusterTickets([]);
      expect(clusters.size).toBe(0);
    });

    it("excludes Epic tickets and promotes their children to independent clusters", () => {
      const epic: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-100",
        type: "Epic",
        title: "A big epic",
      };
      const storyUnderEpic1: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-101",
        type: "Story",
        title: "Story under epic",
        parentId: "PROJ-100",
      };
      const storyUnderEpic2: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-102",
        type: "Story",
        title: "Another story under epic",
        parentId: "PROJ-100",
      };
      const clusters = clusterTickets([epic, storyUnderEpic1, storyUnderEpic2]);

      // Epic itself must be excluded
      expect(clusters.has("PROJ-100")).toBe(false);
      // Each story becomes its own cluster root
      expect(clusters.size).toBe(2);
      expect(clusters.get("PROJ-101")).toEqual([storyUnderEpic1]);
      expect(clusters.get("PROJ-102")).toEqual([storyUnderEpic2]);
    });

    it("excludeTypes comparison is case-insensitive", () => {
      const epic: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-200",
        type: "epic",
        title: "lowercase epic",
      };
      const child: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-201",
        type: "Story",
        parentId: "PROJ-200",
      };
      const clusters = clusterTickets([epic, child], ["Epic"]);
      expect(clusters.has("PROJ-200")).toBe(false);
      expect(clusters.size).toBe(1);
      expect(clusters.get("PROJ-201")).toEqual([child]);
    });

    it("promotes children of phantom parents to independent clusters", () => {
      // Parent not in dataset (e.g. Epic not exported from Jira)
      const orphan1: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-301",
        type: "Story",
        parentId: "PROJ-300", // not in dataset
      };
      const orphan2: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-302",
        type: "Story",
        parentId: "PROJ-300",
      };
      const clusters = clusterTickets([orphan1, orphan2]);

      // Each orphan should be its own cluster (not lumped under phantom PROJ-300)
      expect(clusters.size).toBe(2);
      expect(clusters.get("PROJ-301")).toEqual([orphan1]);
      expect(clusters.get("PROJ-302")).toEqual([orphan2]);
    });

    it("preserves subtask clustering when parent is a Story (not excluded)", () => {
      const story: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-400",
        type: "Story",
      };
      const sub: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-401",
        type: "Sub-Task",
        parentId: "PROJ-400",
      };
      const clusters = clusterTickets([story, sub]);
      expect(clusters.size).toBe(1);
      expect(clusters.get("PROJ-400")).toHaveLength(2);
    });

    it("allows overriding excludeTypes to exclude nothing", () => {
      const epic: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-500",
        type: "Epic",
      };
      const child: Ticket = {
        ...parentTicket,
        ticketId: "PROJ-501",
        type: "Story",
        parentId: "PROJ-500",
      };
      // Pass empty array → no types excluded
      const clusters = clusterTickets([epic, child], []);
      expect(clusters.size).toBe(1);
      expect(clusters.get("PROJ-500")).toHaveLength(2);
    });
  });

  describe("time attribution", () => {
    const clusters = new Map([
      ["PROJ-1", [parentTicket, subtask1, subtask2]],
      ["PROJ-10", [standaloneTicket]],
    ]);

    it("strategy 1: direct match", () => {
      const entries: TimeEntry[] = [
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          durationHours: 4,
          rawComment: "Work on PROJ-2",
          detectedIds: ["PROJ-2"],
          attributionType: "DIRECT",
        },
      ];
      const result = attributeTime(entries, clusters);
      expect(result).toHaveLength(1);
      expect(result[0].attributedClusterId).toBe("PROJ-1");
      expect(result[0].attributedHours).toBe(4);
    });

    it("strategy 2: cluster match (multiple IDs, same cluster)", () => {
      const entries: TimeEntry[] = [
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          durationHours: 8,
          rawComment: "PROJ-1 PROJ-2",
          detectedIds: ["PROJ-1", "PROJ-2"],
          attributionType: "CLUSTER_MATCH",
        },
      ];
      const result = attributeTime(entries, clusters);
      expect(result).toHaveLength(1);
      expect(result[0].attributedClusterId).toBe("PROJ-1");
      expect(result[0].attributedHours).toBe(8);
    });

    it("strategy 3: multi-ID split", () => {
      const entries: TimeEntry[] = [
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          durationHours: 6,
          rawComment: "PROJ-2 PROJ-10",
          detectedIds: ["PROJ-2", "PROJ-10"],
          attributionType: "MULTI_ID_SPLIT",
        },
      ];
      const result = attributeTime(entries, clusters);
      expect(result).toHaveLength(2);
      expect(result[0].attributedHours).toBe(3);
      expect(result[1].attributedHours).toBe(3);
    });

    it("strategy 5: no-ID → unlinked overhead", () => {
      const entries: TimeEntry[] = [
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          durationHours: 2,
          rawComment: "General meeting",
          detectedIds: [],
          attributionType: "UNLINKED_OVERHEAD",
        },
      ];
      const result = attributeTime(entries, clusters);
      expect(result).toHaveLength(1);
      expect(result[0].attributedClusterId).toBeUndefined();
    });
  });

  describe("DQS calculation", () => {
    it("returns 1.0 when all entries are matched", () => {
      const dqs = calculateDqs([
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          originalDurationHours: 8,
          attributedClusterId: "PROJ-1",
          attributedHours: 8,
          attributionReason: "Direct match",
        },
      ]);
      expect(dqs).toBe(1);
    });

    it("returns 0 when all entries are unlinked overhead", () => {
      const dqs = calculateDqs([
        {
          timestamp: "2025-01-15T09:00:00.000Z",
          originalDurationHours: 8,
          attributedHours: 8,
          attributionReason: "No ticket IDs detected",
        },
      ]);
      expect(dqs).toBe(0);
    });

    it("handles empty input", () => {
      expect(calculateDqs([])).toBe(0);
    });
  });

  describe("linear regression", () => {
    it("produces perfect R² for linear data", () => {
      const result = linearRegression([
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
      ]);
      expect(result.slope).toBeCloseTo(2);
      expect(result.rSquared).toBeCloseTo(1, 5);
    });

    it("returns zero for insufficient data", () => {
      const result = linearRegression([{ x: 1, y: 2 }]);
      expect(result.rSquared).toBe(0);
    });
  });

  describe("calibrate", () => {
    it("produces CalibrationResult from ship unit clusters", () => {
      const service = createCalibrationService();

      const clusters: ShipUnitCluster[] = [
        {
          clusterId: "PROJ-1",
          ids: ["PROJ-1", "PROJ-2"],
          metadata: {
            type: "Story",
            timestampT0: "2025-01-01T00:00:00.000Z",
          },
          isvAnalysis: {
            formulaVersion: "3.4",
            isvScore: 4,
            confidence: 0.85,
            factors: {
              A1_Data: 1,
              A2_UX: 3,
              B1_Logic: 1,
              C1_Integration: 1,
              C2_State: 1,
              D3_Quality: 1,
            },
            breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
          },
          metrics: {
            totalHours: 16,
            directMatchHours: 16,
            splitHours: 0,
            dataConfidence: "high",
            gitChanges: {
              locAdded: 200,
              locDeleted: 50,
              filesChanged: 8,
              distributionEntropy: 0.5,
              cyclomaticComplexityDelta: 2,
              changeIntensityScore: 0.3,
            },
          },
        },
        {
          clusterId: "PROJ-10",
          ids: ["PROJ-10"],
          metadata: {
            type: "Story",
            timestampT0: "2025-02-01T00:00:00.000Z",
          },
          isvAnalysis: {
            formulaVersion: "3.4",
            isvScore: 70,
            confidence: 0.9,
            factors: {
              A1_Data: 2,
              A2_UX: 2,
              B1_Logic: 3,
              C1_Integration: 5,
              C2_State: 2,
              D3_Quality: 1,
            },
            breakdown: { poValue: 7, archFactor: 10, qualityMultiplier: 1 },
          },
          metrics: {
            totalHours: 280,
            directMatchHours: 280,
            splitHours: 0,
            dataConfidence: "high",
            gitChanges: {
              locAdded: 2000,
              locDeleted: 300,
              filesChanged: 45,
              distributionEntropy: 0.8,
              cyclomaticComplexityDelta: 15,
              changeIntensityScore: 0.7,
            },
          },
        },
      ];

      const result = service.calibrate(clusters);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.shipRateHoursPerIsv).toBeGreaterThan(0);
      expect(result.data.shipRateExclOutliers).toBeGreaterThan(0);
      expect(result.data.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.data.rSquared).toBeLessThanOrEqual(1);
      expect(result.data.sampleSize).toBe(2);
      expect(result.data.formulaVersion).toBe("3.4");

      // New mandatory fields
      expect(result.data.factorDiagnostics).toHaveLength(9);
      expect(result.data.reliability).toBeDefined();
      expect(result.data.reliability.sampleSize).toBe(2);
      expect(result.data.outliers).toBeDefined();
      expect(result.data.normalityAssessment).toBeDefined();
      expect(result.data.formulaValidation).toBeDefined();
      expect(result.data.formulaValidation.fitAssessment).toBeDefined();
      expect(result.data.formulaValidation.factorRanking).toHaveLength(9);
    });

    it("returns error with fewer than 2 clusters", () => {
      const service = createCalibrationService();
      const result = service.calibrate([]);
      expect(result.success).toBe(false);
    });

    it("applies WLS when clusters carry dataConfidence", () => {
      const service = createCalibrationService();

      // Two clusters with different confidence levels
      const clusters: ShipUnitCluster[] = [
        {
          clusterId: "HIGH-1",
          ids: ["HIGH-1"],
          metadata: { type: "Story", timestampT0: "2025-01-01T00:00:00.000Z" },
          isvAnalysis: {
            formulaVersion: "3.4",
            isvScore: 4,
            confidence: 0.85,
            factors: { A1_Data: 1, A2_UX: 3, B1_Logic: 1, C1_Integration: 1, C2_State: 1, D3_Quality: 1 },
            breakdown: { poValue: 4, archFactor: 1, qualityMultiplier: 1 },
          },
          metrics: {
            totalHours: 16,
            directMatchHours: 16,
            splitHours: 0,
            dataConfidence: "high",
            gitChanges: { locAdded: 200, locDeleted: 50, filesChanged: 8, distributionEntropy: 0.5, cyclomaticComplexityDelta: 2, changeIntensityScore: 0.3 },
          },
        },
        {
          clusterId: "LOW-2",
          ids: ["LOW-2"],
          metadata: { type: "Task", timestampT0: "2025-02-01T00:00:00.000Z" },
          isvAnalysis: {
            formulaVersion: "3.4",
            isvScore: 70,
            confidence: 0.9,
            factors: { A1_Data: 2, A2_UX: 2, B1_Logic: 3, C1_Integration: 5, C2_State: 2, D3_Quality: 1 },
            breakdown: { poValue: 7, archFactor: 10, qualityMultiplier: 1 },
          },
          metrics: {
            totalHours: 280,
            directMatchHours: 0,
            splitHours: 0,
            dataConfidence: "low",
            gitChanges: { locAdded: 0, locDeleted: 0, filesChanged: 0, distributionEntropy: 0, cyclomaticComplexityDelta: 0, changeIntensityScore: 0 },
          },
        },
      ];

      const result = service.calibrate(clusters);
      expect(result.success).toBe(true);
      if (!result.success) return;

      // With only 2 clusters, simple regression is used (not multivariate),
      // but calibration still produces valid output.
      expect(result.data.sampleSize).toBe(2);
      expect(result.data.shipRateHoursPerIsv).toBeGreaterThan(0);
    });

    it("applies WLS on simple regression path for 3-17 clusters with dataConfidence", () => {
      const service = createCalibrationService();

      const base = {
        metadata: { type: "Story" as const, timestampT0: "2025-01-01T00:00:00.000Z" },
        isvAnalysis: {
          formulaVersion: "3.4",
          confidence: 0.9,
          factors: { A1_Data: 1, A2_UX: 1, B1_Logic: 1, C1_Integration: 1, C2_State: 1, D3_Quality: 1 } as const,
          breakdown: { poValue: 1, archFactor: 1, qualityMultiplier: 1 },
        },
      };
      const git = { locAdded: 100, locDeleted: 20, filesChanged: 5, distributionEntropy: 0.4, cyclomaticComplexityDelta: 1, changeIntensityScore: 0.2 };

      // 4 clusters — below multivariate threshold (18) but above the 2-point WLS-degenerate guard.
      // C4 is an outlier pulling the slope up (ISV 40 → 400h) with low confidence.
      const clusters: ShipUnitCluster[] = [
        { ...base, clusterId: "C1", ids: ["C1"], isvAnalysis: { ...base.isvAnalysis, isvScore: 10 }, metrics: { totalHours: 20, directMatchHours: 20, splitHours: 0, dataConfidence: "high" as const, gitChanges: git } },
        { ...base, clusterId: "C2", ids: ["C2"], isvAnalysis: { ...base.isvAnalysis, isvScore: 30 }, metrics: { totalHours: 60, directMatchHours: 55, splitHours: 5, dataConfidence: "high" as const, gitChanges: git } },
        { ...base, clusterId: "C3", ids: ["C3"], isvAnalysis: { ...base.isvAnalysis, isvScore: 50 }, metrics: { totalHours: 100, directMatchHours: 80, splitHours: 20, dataConfidence: "high" as const, gitChanges: git } },
        { ...base, clusterId: "C4", ids: ["C4"], isvAnalysis: { ...base.isvAnalysis, isvScore: 40 }, metrics: { totalHours: 400, directMatchHours: 0, splitHours: 400, dataConfidence: "low" as const, gitChanges: { ...git, locAdded: 0, locDeleted: 0, filesChanged: 0 } } },
      ];

      const withConf = service.calibrate(clusters);
      expect(withConf.success).toBe(true);
      if (!withConf.success) return;
      expect(withConf.data.sampleSize).toBe(4);

      // Compare against unweighted run (strip dataConfidence)
      const unweightedClusters = clusters.map((c) => ({
        ...c,
        metrics: { ...c.metrics, dataConfidence: undefined as unknown as "high" },
      }));
      for (const c of unweightedClusters) delete (c.metrics as Record<string, unknown>).dataConfidence;
      const withoutConf = service.calibrate(unweightedClusters as unknown as ShipUnitCluster[]);
      expect(withoutConf.success).toBe(true);
      if (!withoutConf.success) return;

      // The low-confidence outlier (C4: 400h at ISV 40) should be
      // down-weighted in WLS, producing a meaningfully different ship-rate.
      expect(withConf.data.shipRateHoursPerIsv).not.toBeCloseTo(
        withoutConf.data.shipRateHoursPerIsv,
        1,
      );
    });
  });
});
