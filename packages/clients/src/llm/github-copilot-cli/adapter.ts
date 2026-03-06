import { spawn } from "node:child_process";

import type { LlmPort, LlmPromptInput, LlmPromptResult } from "../port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default hard timeout for CLI invocations (2 minutes). */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Default stall timeout (60 s).
 *
 * If the child process produces no stdout/stderr data for this duration it
 * is considered hung and killed early — without waiting for the full hard
 * timeout.  Set to `0` or `undefined` to disable.
 */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// ANSI / progress stripping
// ---------------------------------------------------------------------------

/**
 * Strip ANSI escape codes and common CLI progress indicators from output.
 */
function stripAnsi(text: string): string {
  return text
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
      "",
    )
    .trim();
}

// ---------------------------------------------------------------------------
// GithubCopilotCliAdapter
// ---------------------------------------------------------------------------

/**
 * LLM adapter that invokes the GitHub Copilot CLI (`gh copilot -p`)
 * to send prompts and capture responses.
 *
 * Uses `-p` (non-interactive prompt) with `-s` (silent/script output)
 * for clean, parseable responses.
 *
 * Includes two layers of timeout protection:
 * - **Stall timeout** — kills the process when no output arrives for
 *   `stallTimeoutMs` (default 60 s). Detects hung API calls early.
 * - **Hard timeout** — absolute upper bound (`timeoutMs`, default 120 s).
 *
 * Stateless and safe for concurrent use.
 */
export class GithubCopilotCliAdapter implements LlmPort {
  private readonly timeoutMs: number;
  private readonly stallTimeoutMs: number;
  private readonly defaultCwd?: string;

  constructor(options?: {
    timeoutMs?: number;
    stallTimeoutMs?: number;
    cwd?: string;
  }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.stallTimeoutMs = options?.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    this.defaultCwd = options?.cwd;
  }

  async prompt(input: LlmPromptInput): Promise<LlmPromptResult> {
    const cwd = input.cwd ?? this.defaultCwd ?? process.cwd();
    const combinedPrompt = input.systemPrompt + "\n\n" + input.userPrompt;

    const text = await this.execCli(combinedPrompt, cwd, input.signal);
    return { text };
  }

  private execCli(
    prompt: string,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("LLM request aborted."));
        return;
      }

      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(hardTimer);
          clearTimeout(stallTimer);
          fn();
        }
      };

      const child = spawn(
        "gh",
        ["copilot", "-p", prompt, "-s", "--no-auto-update"],
        {
          cwd,
          env: { ...process.env, NO_COLOR: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      // ---- Hard timeout (absolute ceiling) --------------------------------
      const hardTimer = setTimeout(() => {
        child.kill();
        settle(() =>
          reject(
            new Error(`LLM request timed out after ${this.timeoutMs}ms.`),
          ),
        );
      }, this.timeoutMs);

      // ---- Stall timeout (no-activity watchdog) ---------------------------
      let stallTimer: ReturnType<typeof setTimeout> = -1 as never;

      const resetStallTimer = () => {
        clearTimeout(stallTimer);
        if (this.stallTimeoutMs > 0) {
          stallTimer = setTimeout(() => {
            child.kill();
            settle(() =>
              reject(
                new Error(
                  `LLM request stalled (no output for ${this.stallTimeoutMs}ms).`,
                ),
              ),
            );
          }, this.stallTimeoutMs);
        }
      };

      // Start the first stall window.
      resetStallTimer();

      // ---- Stream collection + stall reset --------------------------------
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        resetStallTimer();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
        resetStallTimer();
      });

      // ---- Spawn error (ENOENT etc.) --------------------------------------
      child.on("error", (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          settle(() =>
            reject(
              new Error(
                'GitHub Copilot CLI is not available. Ensure "gh" is installed and the copilot extension is enabled.',
              ),
            ),
          );
          return;
        }
        settle(() => reject(err));
      });

      // ---- Process exit ----------------------------------------------------
      child.on("close", (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
        const stderr = Buffer.concat(stderrChunks).toString("utf-8");

        if (code !== 0) {
          settle(() =>
            reject(
              new Error(
                `GitHub Copilot CLI failed: ${stderr || `exit code ${code}`}`,
              ),
            ),
          );
          return;
        }
        settle(() => resolve(stripAnsi(stdout)));
      });

      // ---- Abort signal ----------------------------------------------------
      if (signal) {
        const onAbort = () => {
          child.kill();
          settle(() => reject(new Error("LLM request aborted.")));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        child.on("exit", () =>
          signal.removeEventListener("abort", onAbort),
        );
      }
    });
  }
}
