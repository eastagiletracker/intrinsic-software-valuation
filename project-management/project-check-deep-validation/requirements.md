# Project Check — Deep Validation with Client Health Checks

## User Story

As a **Technical Product Owner / ISV Analyst**, I want **the `check:project` script to verify actual data access and validity through the client layer — not just file existence** so that I can **catch broken XML exports, unreadable Excel files, inaccessible Git repositories, and LLM configuration errors before starting a potentially long-running ISV analysis**.

---

## Motivation

The current `check-project.sh` validates:

- Config JSON syntax and required sections
- File/directory existence (XML, XLSX, Git repos)
- Basic SSH reachability for Git URLs
- Surface-level content checks (e.g. `grep` for ticket prefix in XML)

What it **does not** catch:

- Corrupt or schema-violating Jira XML that the parser will reject
- XLSX files with wrong sheet names, missing columns, or invalid data
- Git repositories that the `GitClient` cannot `prepare()` (auth, branch, bare-clone issues)
- LLM provider misconfiguration (missing API keys, unreachable endpoints)
- Data that passes file checks but produces zero results when parsed

The goal is to add a **lightweight `check()` method** to each client that performs a fast, minimal validation — proving that the data source is accessible and yields parseable results — without running a full analysis.

---

## Scope

### In scope

- New `check(): Promise<Result<CheckReport>>` method on each client interface
- A TypeScript-based check runner (replaces or complements the shell script's deep-validation sections)
- Integration into the existing `pnpm run check:project <name>` workflow
- Per-client health checks:
  - **TicketClient**: Parse the XML/data source, confirm at least one ticket with the expected prefix is returned
  - **TimeTrackingClient**: Parse the time-tracking source, confirm at least one time entry is returned
  - **GitClient**: `prepare()` each configured repository (bare clone or local validation), confirm the repo is usable, then clean up
  - **LlmClient**: Send a trivial prompt (e.g. `"Reply OK"`) and confirm a response is received
  - **StaticAnalysisClient**: Verify that `scc` is installed / callable (the client cannot do meaningful work without a checked-out directory, so this is a tool-availability check only)
- Structured `CheckReport` output per client (status, message, optional details)
- Fast execution: each check should complete in seconds, not minutes
- Graceful degradation: a failing check should not abort other checks

### Out of scope

- Replacing the existing shell-based config structure validation (sections 1–2, 6–8 of the current script remain as-is)
- Full pipeline dry-run or end-to-end integration test
- Caching of check results
- Web UI integration for health checks
- Modifying existing client method signatures or return types

---

## Reference Documents

- [scripts/check-project.sh](../../scripts/check-project.sh) — Current shell-based check script
- [QA Strategy](../../docs/qa-strategy.md) — Testing tiers
- [ISV Engine - 00 - The Big Picture](../../docs/concept/ISV%20Engine%20-%2000%20-%20The%20Big%20Picture.md) — System overview

---

## Design Approach

### Option A — `check()` method on each client interface (recommended)

Add an optional `check()` method to the client interfaces. Each adapter implements a lightweight validation:

```typescript
interface TicketClient {
  // existing
  getTickets(query?: TicketQuery): Promise<Result<Ticket[]>>;
  // new
  check(): Promise<Result<ClientCheckReport>>;
}
```

**Pros**: Validation logic lives next to the code it validates; reusable outside the script.
**Cons**: Extends existing interfaces (use `extends` or a separate `Checkable` mixin).

### Option B — Standalone check functions per client

Provide factory functions like `checkTicketAccess(config): Promise<Result<ClientCheckReport>>` that instantiate a minimal, throwaway client and run one validation call.

**Pros**: No interface changes; check logic is isolated.
**Cons**: May duplicate factory setup; check functions drift from actual client behaviour.

**Recommendation**: Option A gives the strongest guarantee that what you check is what you run. If interface extension is too invasive, Option B is acceptable.

---

## Data Model

```typescript
interface ClientCheckReport {
  readonly client: 'ticket' | 'time-tracking' | 'git' | 'llm' | 'static-analysis';
  readonly status: 'ok' | 'warn' | 'fail';
  readonly message: string;
  readonly details?: ReadonlyArray<{
    readonly item: string;        // e.g., repository ID, file name
    readonly status: 'ok' | 'warn' | 'fail';
    readonly message: string;
  }>;
  readonly durationMs: number;
}
```

---

## Acceptance Criteria

### AC-1 — TicketClient check

- [ ] **AC-1.1** `TicketClient.check()` parses the configured data source and returns `ok` if ≥ 1 ticket with the expected prefix is found
- [ ] **AC-1.2** Returns `fail` with a descriptive message if the XML is corrupt, the file is missing, or zero matching tickets are found
- [ ] **AC-1.3** Execution completes in < 5 s for typical Jira XML exports (< 50 MB)

### AC-2 — TimeTrackingClient check

- [ ] **AC-2.1** `TimeTrackingClient.check()` parses the configured data source and returns `ok` if ≥ 1 time entry is found
- [ ] **AC-2.2** Returns `fail` with a descriptive message if the XLSX is unreadable, has unexpected structure, or yields zero entries
- [ ] **AC-2.3** Execution completes in < 5 s for typical Excel exports

### AC-3 — GitClient check

- [ ] **AC-3.1** `GitClient.check()` runs `prepare()` for each configured repository and returns per-repo `ok` / `fail` status
- [ ] **AC-3.2** After validation, any temporary bare clones are cleaned up (no leftover state)
- [ ] **AC-3.3** Returns `fail` per repository with a clear reason (auth failure, network timeout, invalid local path, not a git repo)
- [ ] **AC-3.4** Individual repository failures do not prevent checking the remaining repositories

### AC-4 — LlmClient check

- [ ] **AC-4.1** `LlmClient.check()` sends a minimal prompt (e.g. system: `"Respond OK"`, user: `"health check"`) and returns `ok` if a non-empty response is received
- [ ] **AC-4.2** Returns `fail` if the provider is unreachable, the API key is invalid, or no response is returned within 15 s
- [ ] **AC-4.3** The check does not consume significant tokens (prompt + response < 50 tokens)

### AC-5 — StaticAnalysisClient check

- [ ] **AC-5.1** Check verifies that the `scc` binary is available on `$PATH` and executable
- [ ] **AC-5.2** Optionally verifies `jscpd` and `knip` availability and reports `warn` if missing
- [ ] **AC-5.3** Does not require a checked-out directory to succeed

### AC-6 — Check runner integration

- [ ] **AC-6.1** A new TypeScript entry point (e.g. `scripts/check-project-deep.ts` or integrated into the pipeline package) accepts a `project-config.json` path and runs all client checks
- [ ] **AC-6.2** The runner creates each client from the project config using the existing factory functions, calls `check()`, and collects the reports
- [ ] **AC-6.3** Output is human-readable in the terminal (✅ / ⚠️ / ❌ format matching the existing script style)
- [ ] **AC-6.4** The runner returns exit code 0 if all checks pass, 1 if any check fails
- [ ] **AC-6.5** The existing `check-project.sh` invokes the deep-validation runner after its own structural checks pass (or the runner is available as a separate `pnpm run check:project:deep <name>` command)

### AC-7 — Testing

- [ ] **AC-7.1** Each `check()` method has Tier 2 adapter tests using `__fixtures__/` data
- [ ] **AC-7.2** The check runner has a Tier 3 boundary test that mocks all clients and verifies report aggregation
- [ ] **AC-7.3** Tests cover `ok`, `warn`, and `fail` paths for each client

---

## Implementation Notes

- **TicketClient / TimeTrackingClient**: The `check()` can reuse the existing `parse()` port, stopping after the first valid record. Consider a `{ limit: 1 }` optimisation if parsing is expensive.
- **GitClient**: `prepare()` already does bare clones or local validation — `check()` wraps it with cleanup. For remote repos this is the most expensive check (network I/O); consider a timeout.
- **LlmClient**: Use the existing `prompt()` method with a minimal payload. The check doubles as API-key validation.
- **StaticAnalysisClient**: Use `which scc` / `command -v scc` logic; no actual analysis is needed.
- **CachedClient decorators**: The `check()` method should bypass the cache and always hit the real source. This ensures the check validates actual access.

---

## Open Questions

1. Should the deep check be a mandatory gate before `IsvCalculationPipeline.run()`, or remain a manual pre-flight step?
2. Should `check()` be on the high-level client interfaces or on the lower-level port interfaces (or both)?
3. Is there value in a `--fix` mode that attempts to auto-remediate common issues (e.g. re-clone a corrupt bare repo)?
