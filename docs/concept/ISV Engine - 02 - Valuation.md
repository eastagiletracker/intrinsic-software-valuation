# ISV Engine: Valuation (Calculation Engine)

## Purpose and Context

The Valuation Engine is phase 3 of ISV automation and the mathematical core of the value-based model. It transforms architectural gaps from the Gap Analyzer and technical metrics from the Fact Finder into a standardized, dimensionless value: Intrinsic Software Value (ISV).

This value represents the structural size and complexity of a requirement without relying on subjective time estimates.

## Core Formula (Version 3.3)

The calculation combines functional value (what is built) and technical leverage (how hard the intervention is in the existing architecture).

$$
ISV = ((A1 \times A2) + B1) \times (C1 \times C2) \times D3
$$

- PO value (functional value): `((A1 * A2) + B1)`
- Architecture factor (technical leverage and risk): `(C1 * C2)`
- Quality multiplier: `D3`

## ISV Factors and Metrics

### Functional Value (Business and Feature Gravity)

This block evaluates content complexity of a ticket.

- `A1` (Data Value): Effort on entity and data-model layer.
  - `1.0`: Known entities, read-only, pure display.
  - `3.0`: Create or edit a single entity.
  - `6.0`: Schema expansion or complex transaction handling, including migrations and rollback strategy.
- `A2` (UX Multiplier): Depth of user interaction.
  - `1.0`: Headless (no UI), neutral multiplier.
  - `1.5`: Standard component integration.
  - `3.0`: Custom UI with complex client state.
- `B1` (Logic Value): Algorithmic depth and transformation complexity.
  - Range: `0.0` to `8.0`.
  - Examples: `0.0` pass-through routing, `3.0` conditional logic or validation, `8.0` heavy computation or AI.

### Technical Leverage (Architecture and Legacy Friction)

This block evaluates intervention depth and systemic risk.

- `C1` (Integration Factor): How deep the architecture cut is.
  - `1.0`: Local change, no new adapters.
  - `4.0`: Deep integration requiring a new external adapter.
  - `5.0`: New major infrastructure components.
- `C2` (State Factor): Technical debt and system health, derived by the Fact Finder.
  - Range: `1.0` to `3.0`.
  - Examples: `1.0` clean and tested, `2.0` moderate debt, `3.0` toxic legacy.
  - Effect: Risky interventions in toxic systems amplify final ISV.

### Quality Level

- `D3` (Definition of Done)
  - Standard: `1.0`
  - Increased for stronger requirements, for example `1.3` for mandatory E2E tests or `2.0` for audit/compliance constraints.

## Simulations and Case Studies

These scenarios validate whether the formula produces realistic value relationships.

### Scenario: React Component (Frontend Heavy)

New interactive calendar with drag and drop, backend provides existing data.

- Values: `A1=1.0`, `A2=3.0`, `B1=1.0`, `C1=1.0`, `C2=1.0`, `D3=1.0`
- PO value: `(1.0 * 3.0) + 1.0 = 4.0`
- Architecture factor: `1.0 * 1.0 = 1.0`
- Total ISV: `4.0`
- Observation: Frontend complexity is represented through `A2=3.0` without architecture penalty.

### Scenario: Salesforce Integration (Integration Heavy)

Push leads from a standard form to a new Salesforce CRM; mapping logic required; adapter missing.

- Values: `A1=3.0`, `A2=1.5`, `B1=3.0`, `C1=4.0`, `C2=1.5`, `D3=1.0`
- PO value: `(3.0 * 1.5) + 3.0 = 7.5`
- Architecture factor: `4.0 * 1.5 = 6.0`
- Total ISV: `45.0`
- Observation: New third-party integration in a moderately indebted backend drives risk and value sharply upward.

### Scenario: Headless Database Migration (Backend Heavy)

Deep local schema expansion and migration, no UI.

- Values: `A1=6.0`, `A2=1.0`, `B1=3.0`, `C1=1.0`, `C2=1.0`, `D3=1.0`
- PO value: `(6.0 * 1.0) + 3.0 = 9.0`
- Architecture factor: `1.0 * 1.0 = 1.0`
- Total ISV: `9.0`
- Observation: Migration effort is captured in `A1`; if `C2=3.0`, ISV increases to `27.0`.

### Scenario: Small Bugfix in Toxic Legacy

Small frontend adjustment with pass-through logic in a highly outdated system.

- Values: `A1=1.0`, `A2=1.5`, `B1=0.0`, `C1=1.0`, `C2=3.0`, `D3=1.0`
- PO value: `(1.0 * 1.5) + 0.0 = 1.5`
- Architecture factor: `1.0 * 3.0 = 3.0`
- Total ISV: `4.5`
- Observation: Technical debt penalty makes even small changes expensive and economically highlights refactoring needs.