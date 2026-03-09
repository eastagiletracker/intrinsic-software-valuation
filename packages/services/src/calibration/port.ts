import type {
  CalibrationResult,
  ShipUnitCluster,
  AttributedTimeEntry,
  Ticket,
  Result,
} from "@isv/domain";
import type { TimeEntry } from "@isv/domain";

/**
 * Calibration service port.
 *
 * Handles ticket clustering, time attribution, and Ship Rate regression
 * for historical calibration.
 */
export interface CalibrationPort {
  /**
   * Cluster tickets by parent-subtask relationship.
   *
   * Tickets whose type matches an entry in `excludeTypes` (case-insensitive)
   * are dropped. Children that referenced an excluded parent are promoted
   * to independent cluster roots (or to their own parentId chain).
   *
   * @param tickets - All tickets to cluster.
   * @param excludeTypes - Ticket types to exclude (default: `["Epic"]`).
   * @returns Clusters: arrays of related ticket IDs keyed by cluster ID.
   */
  clusterTickets(
    tickets: Ticket[],
    excludeTypes?: string[],
  ): Map<string, Ticket[]>;

  /**
   * Attribute time entries to clusters.
   *
   * @param entries - Raw time entries from time tracking.
   * @param clusters - Ticket clusters (clusterId → tickets).
   * @returns Attributed time entries with audit trail.
   */
  attributeTime(
    entries: TimeEntry[],
    clusters: Map<string, Ticket[]>,
  ): AttributedTimeEntry[];

  /**
   * Calculate Data Quality Score.
   *
   * DQS = (Matched + KBV) / Total hours
   *
   * @param attributed - Attributed time entries.
   * @returns DQS between 0 and 1.
   */
  calculateDqs(attributed: AttributedTimeEntry[]): number;

  /**
   * Run Ship Rate regression on completed clusters.
   *
   * @param clusters - Ship unit clusters with ISV scores and hours.
   * @returns CalibrationResult with Ship Rate and R².
   */
  calibrate(clusters: ShipUnitCluster[]): Result<CalibrationResult>;
}
