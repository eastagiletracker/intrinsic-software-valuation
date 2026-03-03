# ISV Engine: The Big Picture

## Purpose and Context

The ISV Engine is a fully automated architecture and valuation process. It replaces subjective, error-prone effort estimations with Value Metrology: the calculation of an objective, deterministic value called the Intrinsic Software Value (ISV).

Instead of asking humans, "How long will this take?", the engine asks the codebase and an AI, "How large is the structural gap between what the system can do today and what the new ticket requires?" The result is a dimensionless metric that reflects architectural complexity and risk.

## End-to-End Workflow

The engine runs as an invisible pipeline (for example in GitHub Actions or GitLab CI) and integrates directly into the agile process through Jira.

- Trigger: A Product Owner sets a Jira ticket to the status "Ready for Refinement".
- Phase 1 (Fact Finder): A script scans repositories and determines the current architecture baseline.
- Phase 2 (Gap Analyzer): An AI agent compares the Jira ticket with the current state and identifies the architectural delta.
- Phase 3 (Valuation Engine): A deterministic script converts the delta into the final ISV score using a fixed formula.
- Result: The Jira ticket is automatically updated (for example `Custom Field ISV: 45.0`) and receives a transparent comment with technical gaps and risks.

## The Three Phases in Detail

### Phase 1: Fact Finder (Digital Twin)

- Objective: Capture the baseline (status quo).
- Functionality: Data is not interpreted, only counted.
- Output 1: `system_context.json`, a machine-readable architecture map (frontend patterns, entities, adapters).
- Output 2: Health metrics for code quality, test coverage, and god classes.
- Impact: Health metrics contribute to the State Factor (`C2`), for example `1.0` for clean code and `3.0` for toxic legacy code.

### Phase 2: Gap Analyzer (AI Bridge)

- Objective: Determine the delta between target state (ticket) and current state (code).
- Functionality: A Large Language Model (for example GPT-4o) reads the Jira ticket and `system_context.json`.
- Measuring tape: The AI applies the formal ISV Questionnaire (V3.3) and evaluates only the gap.
- Focus questions: Does a new database schema need to be built? Is an API adapter missing?
- Output: A strictly typed JSON object with values (`A1`, `A2`, `B1`, `C1`) and a concrete to-do list of required architecture extensions.

### Phase 3: Valuation Engine (Calculator)

- Objective: Calculate the final value mathematically.
- Functionality: A pure code script (without AI) combines values from phase 1 and phase 2.

Core formula:

$$
ISV = ((A1 \times A2) + B1) \times (C1 \times C2) \times D3
$$

- `((A1 * A2) + B1)`: Functional value (data volume, UI depth, logic).
- `(C1 * C2)`: Architectural leverage and systemic risk.

This formula makes technical debt commercially visible. If a deep intervention (`C1`) is required in an outdated, untested system (`C2`), the ISV score rises significantly and economically penalizes missing refactoring.

## Paradigm Shift

The engine changes collaboration between Product Management and Development:

- No manual catalogs: Product Owners no longer fill out questionnaires.
- Delta focus: A "login" in a system with an identity provider has a low ISV (for example `4.0`), while in an empty system it is much higher (for example `45.0`).
- Plausibility in refinement: Developers validate the Gap Analyzer output instead of spending hours on estimates.
- Quality gates: If a ticket is too vague, phase 2 aborts with a low confidence score and automatically sends the ticket back for refinement.

## Outlook: Calibration and Price Tag

The ISV Engine provides the exact structural size of a feature. To derive budgets, pricing, or capacity planning, historical calibration is applied.

For details on method, data model, and workflow, see [ISV Engine - 03 - Historical Calibration](docs/concept/ISV%20Engine%20-%2003%20-%20Historical%20Calibration.md).