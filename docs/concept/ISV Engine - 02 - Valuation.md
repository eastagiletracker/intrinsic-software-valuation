# ISV Engine: Valuation (Calculation Engine)

## Purpose and Context

The Valuation Engine is phase 3 of ISV automation and the mathematical core of the value-based model. It transforms architectural gaps from the Gap Analyzer and technical metrics from the Fact Finder into a standardized, dimensionless value: Intrinsic Software Value (ISV).

This value represents the structural size and complexity of a requirement without relying on subjective time estimates.

## Core Formula (Version 3.4)

The calculation combines functional value (what is built) and technical leverage (how hard the intervention is in the existing architecture).

$$
ISV = ((A1 \times A2) + B1) \times (C1 \times C2) \times D3
$$

- PO value (functional value): `((A1 * A2) + B1)`
- Architecture factor (technical leverage and risk): `(C1 * C2)`
- Quality multiplier: `D3`

### Formula Versioning

The ISV formula is a **static, deterministic calculation**. It is never adjusted automatically by calibration or any runtime process. The formula structure and its factor scales are fixed per version.

Because ISV scores become part of real-world legal contracts, every formula version must be explicitly tracked:

- The version identifier (e.g. `3.4`) is embedded in every `IsvResult` output.
- Calibration results reference the formula version they were computed against.
- A change to the formula structure, factor scales, or the C2 derivation model constitutes a **new version** (e.g. `3.4` → `3.5`).
- Historical results remain valid under their original version; re-calibration against a new version is a separate, deliberate step.

Calibration diagnostics (see [ISV Engine - 03 - Historical Calibration](ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md)) may surface statistical evidence that suggests a formula revision. Such evidence informs a **manual, human-decided version bump** — it never triggers an automatic adjustment.

## ISV Factors and Metrics

### Functional Value (Business and Feature Gravity)

This block evaluates content complexity of a ticket.

- `A1` (Data Value): Effort on entity and data-model layer.
  - `1`: Known entities, read-only, pure display.
  - `2`: Create or edit a single entity.
  - `3`: Multi-entity changes or relations (aggregates, joins, cross-entity writes).
  - `5`: Schema expansion, complex transactions, or migrations with rollback strategy.
- `A2` (UX Multiplier): Depth of user interaction.
  - `1`: Headless (no UI) — neutral multiplier.
  - `2`: Standard component integration (forms, lists, existing UI patterns).
  - `3`: Custom UI with complex client-side state (drag-and-drop, rich interactions).
- `B1` (Logic Value): Algorithmic depth and transformation complexity.
  - `0`: Pass-through / routing — no business logic.
  - `1`: Simple transformation or mapping.
  - `2`: Validation or conditional logic.
  - `3`: State machines or workflows.
  - `5`: Complex algorithms.
  - `8`: Heavy computation or AI integration.

### Technical Leverage (Architecture and Legacy Friction)

This block evaluates intervention depth and systemic risk.

- `C1` (Integration Factor): How deep the architecture cut is.
  - `1`: Local change, no new adapters.
  - `2`: Extension of existing adapters or APIs.
  - `3`: Core refactoring or new internal adapter.
  - `5`: New third-party system or major infrastructure components.
- `C2` (State Factor): Technical debt and system health, derived by the Valuation service from `HealthScores`.
  - `1`: Clean codebase, well-tested, low complexity.
  - `2`: Moderate technical debt — tolerable but measurable risk.
  - `3`: Toxic legacy — high complexity, poor test coverage, or rampant duplication.
  - See the **C2 Derivation Formula** section below for the exact threshold rules.

### Quality Level

- `D3` (Definition of Done): Target quality level for the ticket. Assessed by the Gap Analyzer from ticket signals and project configuration. Default is `1`.
  - `1`: Standard Definition of Done.
  - `2`: Elevated requirements — mandatory E2E tests, WCAG AAA, security audit.
  - `3`: Regulatory or compliance constraints (audit trail, formal certification).

### C2 Derivation Formula

`C2` is derived deterministically by the Valuation service from the `HealthScores` of the `CodeHealthReport`. It is not set manually. A weighted penalty model is applied:

| Metric | Condition | Penalty |
| --- | --- | --- |
| `avgCyclomaticComplexity` | < 5 | 0 |
| `avgCyclomaticComplexity` | 5–15 | 1 |
| `avgCyclomaticComplexity` | > 15 | 2 |
| `duplicationPercentage` | < 5 % | 0 |
| `duplicationPercentage` | 5–20 % | 1 |
| `duplicationPercentage` | > 20 % | 2 |
| `coveragePercentage` | ≥ 70 % (or not measured) | 0 |
| `coveragePercentage` | 40–70 % | 1 |
| `coveragePercentage` | < 40 % | 2 |
| `godClassCount` | < 5 | 0 |
| `godClassCount` | ≥ 5 | 1 |

**Total penalty → C2:**

- `0–1` → C2 = `1` (clean)
- `2–4` → C2 = `2` (moderate debt)
- `5+` → C2 = `3` (toxic legacy)

When multiple repositories are analysed, C2 is derived per repository and the **maximum** value across all repositories is used as the effective C2 for the ISV calculation, since any single toxic repo poisons the whole system intervention.

## Simulations and Case Studies

These scenarios validate whether the formula produces realistic value relationships.

### Scenario: React Component (Frontend Heavy)

New interactive calendar with drag and drop, backend provides existing data.

- Values: `A1=1`, `A2=3`, `B1=1`, `C1=1`, `C2=1`, `D3=1`
- PO value: `(1 × 3) + 1 = 4`
- Architecture factor: `1 × 1 = 1`
- Total ISV: `4`
- Observation: Frontend complexity is represented through `A2=3` without architecture penalty.

### Scenario: Salesforce Integration (Integration Heavy)

Push leads from a standard form to a new Salesforce CRM; mapping logic required; adapter missing.

- Values: `A1=2`, `A2=2`, `B1=3`, `C1=5`, `C2=2`, `D3=1`
- PO value: `(2 × 2) + 3 = 7`
- Architecture factor: `5 × 2 = 10`
- Total ISV: `70`
- Observation: New third-party integration in a moderately indebted backend drives risk and value sharply upward. The Fibonacci integer scale eliminates fractional multipliers; the step from `1` to `2` for C2 (moderate debt) is now a full doubling, which more accurately represents the qualitative risk jump.

### Scenario: Headless Database Migration (Backend Heavy)

Deep local schema expansion and migration, no UI.

- Values: `A1=5`, `A2=1`, `B1=3`, `C1=1`, `C2=1`, `D3=1`
- PO value: `(5 × 1) + 3 = 8`
- Architecture factor: `1 × 1 = 1`
- Total ISV: `8`
- Observation: Migration effort is captured in `A1=5` (schema expansion); if `C2=3` (toxic legacy), ISV increases to `24`.

### Scenario: Small Bugfix in Toxic Legacy

Small frontend adjustment with pass-through logic in a highly outdated system.

- Values: `A1=1`, `A2=2`, `B1=0`, `C1=1`, `C2=3`, `D3=1`
- PO value: `(1 × 2) + 0 = 2`
- Architecture factor: `1 × 3 = 3`
- Total ISV: `6`
- Observation: Technical debt penalty makes even small changes expensive and economically highlights refactoring needs.
