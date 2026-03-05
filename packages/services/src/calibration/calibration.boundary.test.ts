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
  });
});
