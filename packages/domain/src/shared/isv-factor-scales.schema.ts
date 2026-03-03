import { z } from "zod";

/**
 * ISV factor measurement scales based on Fibonacci numbers.
 *
 * Each scale defines the valid discrete values for one factor in the ISV formula:
 *   ISV = ((A1 × A2) + B1) × (C1 × C2) × D3
 *
 * Multiplicative factors (A1, A2, C1, C2, D3) are always ≥ 1 (no discount).
 * B1 is the only additive factor and starts at 0 (no logic complexity).
 *
 * All values are integers from the Fibonacci sequence: 0, 1, 2, 3, 5, 8.
 */

// ---------------------------------------------------------------------------
// Functional Value: (A1 × A2) + B1
// ---------------------------------------------------------------------------

/** A1 — Data Value: effort on entity and data-model layer. Multiplicative with A2. */
export const A1DataScale = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)])
  .describe(
    "A1 Data Value — 1: read-only / display of known entities, " +
      "2: single entity create or edit, " +
      "3: multi-entity changes or relations, " +
      "5: schema expansion, complex transactions, migrations",
  );

/** A2 — UX Multiplier: depth of user interaction. Multiplicative with A1. */
export const A2UxScale = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe(
    "A2 UX Multiplier — 1: headless / no UI (neutral), " +
      "2: standard component integration, " +
      "3: custom UI with complex client state",
  );

/** B1 — Logic Value: algorithmic depth and transformation complexity. Additive to (A1 × A2). */
export const B1LogicScale = z
  .union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(8),
  ])
  .describe(
    "B1 Logic Value — 0: pass-through / routing, " +
      "1: simple transform, " +
      "2: validation / conditional logic, " +
      "3: status machines / workflows, " +
      "5: complex algorithms, " +
      "8: heavy computation or AI integration",
  );

// ---------------------------------------------------------------------------
// Technical Leverage: C1 × C2
// ---------------------------------------------------------------------------

/** C1 — Integration Factor: how deep the architecture cut is. Multiplicative with C2. */
export const C1IntegrationScale = z
  .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)])
  .describe(
    "C1 Integration Factor — 1: local change, no new adapters, " +
      "2: extension of existing adapters or APIs, " +
      "3: core refactoring or new internal adapter, " +
      "5: new third-party system or major infrastructure",
  );

/** C2 — State Factor: technical debt and system health. Derived from code health metrics. Multiplicative with C1. */
export const C2StateScale = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe(
    "C2 State Factor — 1: clean and well-tested codebase, " +
      "2: moderate technical debt, " +
      "3: toxic legacy with high risk and poor test coverage",
  );

// ---------------------------------------------------------------------------
// Quality Multiplier: D3
// ---------------------------------------------------------------------------

/** D3 — Quality Multiplier: Definition of Done requirements. Multiplicative with everything. */
export const D3QualityScale = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe(
    "D3 Quality Multiplier — 1: standard Definition of Done, " +
      "2: elevated requirements (mandatory E2E tests, security audit), " +
      "3: regulatory or compliance constraints",
  );

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type A1Data = z.infer<typeof A1DataScale>;
export type A2Ux = z.infer<typeof A2UxScale>;
export type B1Logic = z.infer<typeof B1LogicScale>;
export type C1Integration = z.infer<typeof C1IntegrationScale>;
export type C2State = z.infer<typeof C2StateScale>;
export type D3Quality = z.infer<typeof D3QualityScale>;
