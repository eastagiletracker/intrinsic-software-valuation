import type {
  CalibrationResult,
  ShipUnitCluster,
  AttributedTimeEntry,
  Ticket,
  TimeEntry,
  Result,
} from "@isv/domain";

import type { CalibrationPort } from "./port.js";
import { FORMULA_VERSION } from "../valuation/formula.js";

// ---------------------------------------------------------------------------
// Ticket clustering
// ---------------------------------------------------------------------------

/**
 * Cluster tickets by parent-subtask relationship.
 *
 * A cluster consists of a parent ticket + all its subtasks.
 * Tickets without parents become their own single-ticket cluster.
 */
function clusterTickets(tickets: Ticket[]): Map<string, Ticket[]> {
  const clusters = new Map<string, Ticket[]>();

  // Index by ticketId for quick lookup
  const ticketMap = new Map<string, Ticket>();
  for (const t of tickets) {
    ticketMap.set(t.ticketId, t);
  }

  for (const t of tickets) {
    const clusterId = t.parentId ?? t.ticketId;

    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(t);
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Time attribution (5 strategies)
// ---------------------------------------------------------------------------

function attributeTime(
  entries: TimeEntry[],
  clusters: Map<string, Ticket[]>,
): AttributedTimeEntry[] {
  const attributed: AttributedTimeEntry[] = [];

  // Build reverse index: ticketId → clusterId
  const ticketToCluster = new Map<string, string>();
  for (const [clusterId, tickets] of clusters) {
    for (const t of tickets) {
      ticketToCluster.set(t.ticketId, clusterId);
    }
  }

  for (const entry of entries) {
    const ids = entry.detectedIds;

    if (ids.length === 0) {
      // Strategy 5: no-ID — unlinked overhead
      attributed.push({
        timestamp: entry.timestamp,
        originalDurationHours: entry.durationHours,
        attributedHours: entry.durationHours,
        attributionReason: "No ticket IDs detected — classified as unlinked overhead",
      });
      continue;
    }

    // Find matching clusters
    const matchingClusters = new Set<string>();
    for (const id of ids) {
      const cid = ticketToCluster.get(id);
      if (cid) matchingClusters.add(cid);
    }

    if (matchingClusters.size === 0) {
      // Strategy 4: threshold — ticket IDs present but no matching cluster
      attributed.push({
        timestamp: entry.timestamp,
        originalDurationHours: entry.durationHours,
        attributedHours: entry.durationHours,
        attributionReason: `Ticket IDs ${ids.join(", ")} found but no matching cluster — KBV`,
      });
      continue;
    }

    if (matchingClusters.size === 1) {
      const clusterId = [...matchingClusters][0];

      if (ids.length === 1) {
        // Strategy 1: direct match
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: entry.durationHours,
          attributionReason: `Direct match: ${ids[0]} → cluster ${clusterId}`,
        });
      } else {
        // Strategy 2: cluster match (multiple IDs, same cluster)
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: entry.durationHours,
          attributionReason: `Cluster match: ${ids.join(", ")} all map to cluster ${clusterId}`,
        });
      }
    } else {
      // Strategy 3: multi-ID split across clusters
      const splitHours = entry.durationHours / matchingClusters.size;
      for (const clusterId of matchingClusters) {
        attributed.push({
          timestamp: entry.timestamp,
          originalDurationHours: entry.durationHours,
          attributedClusterId: clusterId,
          attributedHours: splitHours,
          attributionReason: `Multi-ID split: ${entry.durationHours}h ÷ ${matchingClusters.size} clusters = ${splitHours}h for cluster ${clusterId}`,
        });
      }
    }
  }

  return attributed;
}

// ---------------------------------------------------------------------------
// Data Quality Score
// ---------------------------------------------------------------------------

function calculateDqs(attributed: AttributedTimeEntry[]): number {
  if (attributed.length === 0) return 0;

  let totalHours = 0;
  let matchedOrKbvHours = 0;

  for (const entry of attributed) {
    totalHours += entry.attributedHours;
    if (entry.attributedClusterId !== undefined) {
      // Matched (direct, cluster, or split)
      matchedOrKbvHours += entry.attributedHours;
    } else if (entry.attributionReason.includes("KBV")) {
      // KBV entries count toward DQS
      matchedOrKbvHours += entry.attributedHours;
    }
  }

  return totalHours > 0 ? matchedOrKbvHours / totalHours : 0;
}

// ---------------------------------------------------------------------------
// Ship Rate regression (simple linear regression)
// ---------------------------------------------------------------------------

function linearRegression(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: 0, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.x + intercept;
    ssRes += (p.y - predicted) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

function calibrate(clusters: ShipUnitCluster[]): Result<CalibrationResult> {
  if (clusters.length < 2) {
    return {
      success: false,
      error: {
        code: "INSUFFICIENT_DATA",
        message: `Need at least 2 clusters for regression, got ${clusters.length}`,
        source: "calibration",
      },
    };
  }

  const points = clusters.map((c) => ({
    x: c.isvAnalysis.isvScore,
    y: c.metrics.totalHours,
  }));

  const { slope, rSquared } = linearRegression(points);

  // Ship rate = slope (hours per ISV point)
  const shipRateHoursPerIsv = Math.max(slope, 0.01); // ensure positive

  // Period
  const timestamps = clusters.map((c) => c.metadata.timestampT0);
  const sorted = [...timestamps].sort();

  return {
    success: true,
    data: {
      formulaVersion: FORMULA_VERSION,
      shipRateHoursPerIsv,
      rSquared: Math.max(0, Math.min(1, rSquared)),
      dataQualityScore: 1, // placeholder — set by pipeline
      sampleSize: clusters.length,
      periodStart: sorted[0],
      periodEnd: sorted[sorted.length - 1],
    },
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class CalibrationService implements CalibrationPort {
  clusterTickets(tickets: Ticket[]) {
    return clusterTickets(tickets);
  }

  attributeTime(entries: TimeEntry[], clusters: Map<string, Ticket[]>) {
    return attributeTime(entries, clusters);
  }

  calculateDqs(attributed: AttributedTimeEntry[]) {
    return calculateDqs(attributed);
  }

  calibrate(clusters: ShipUnitCluster[]) {
    return calibrate(clusters);
  }
}

/**
 * Create a Calibration service instance.
 */
export function createCalibrationService(): CalibrationPort {
  return new CalibrationService();
}

// Exported for testing
export { clusterTickets, attributeTime, calculateDqs, linearRegression };
