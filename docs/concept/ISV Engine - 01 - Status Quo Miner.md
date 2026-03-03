# ISV Engine: Status Quo Miner (Fact Finder)

## Purpose and Context

The Status Quo Miner creates a digital twin of the current codebase across system boundaries.

It follows deterministic data collection: no interpretation, only counting. This makes it robust for large-scale historical analyses.

## Input and Time-Travel Checkout

To determine a historical baseline before the start of a ticket, the Fact Finder travels back in time.

- Target repositories: A list of `n` Git repositories (for example `frontend-app`, `backend-service-java`).
- Target timestamp: An exact ISO 8601 point in time, typically the Jira ticket creation date.
- Checkout logic: For each repository, the last commit before the timestamp is identified and checked out.

## Data to Be Collected (Big 5 Set)

Metrics are grouped into two dimensions: structural facts (size and activity) and health scores (risk and debt).

### Structural Facts (Size and Activity)

These metrics describe system size and current activity hotspots.

- Volume (code size)
  - Metric: Total lines of code (LoC) and absolute number of files.
  - Tool: `scc` or `cloc`.
- Architecture entry points (proxy for system surface)
  - Metric: Number of defined functional entry points.
  - Note: Highly stable and scalable for historical runs because it does not rely on dynamic parsing.
  - Backend: Count controllers or resolvers (for example `*Controller.java`, `*Resolver.java`).
  - Frontend: Count main views (for example files in `/pages`, `/views`, or patterns like `*Page.tsx`, `*Screen.tsx`).
  - Tool: File system search (`find`, `fd`) or pattern recognition in file lists.
- Git hotspots (danger zone)
  - Metric: Top 50 most frequently changed files in the last 12 months.
  - Note: Indicates where the nervous core components are located.
  - Tool: `git log --format=format: --name-only | sort | uniq -c | sort -nr | head -50`.

### Health Scores (Risk and Technical Debt)

These metrics represent codebase health. They strongly correlate with integration effort and influence the Legacy Factor (`C2`).

- Complexity, duplication, and god classes
  - Metric: Average cyclomatic complexity, duplication percentage, and number of files with more than 1,000 lines.
  - Tool: `scc` (complexity and god classes) plus `jscpd` (duplication score).
- Test health and system rot
  - Metric: Unit test coverage plus outdated or vulnerable dependencies and dead code.
  - Tool: `JaCoCo` or `Jest` (coverage), `Knip` (dead code for JS/TS), `npm outdated --json` or `mvn versions:display-dependency-updates`.

## Output

`system_context_{timestamp}.json`

An aggregated JSON report split into `structural_facts` and `health_scores`.