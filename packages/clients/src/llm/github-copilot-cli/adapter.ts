import { execFile } from "node:child_process";

import type { LlmPort, LlmPromptInput, LlmPromptResult } from "../port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for CLI invocations (2 minutes). */
const DEFAULT_TIMEOUT_MS = 120_000;

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
 * Stateless and safe for concurrent use.
 */
export class GithubCopilotCliAdapter implements LlmPort {
  private readonly timeoutMs: number;
  private readonly defaultCwd?: string;

  constructor(options?: { timeoutMs?: number; cwd?: string }) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultCwd = options?.cwd;
  }

  async prompt(input: LlmPromptInput): Promise<LlmPromptResult> {
    const cwd = input.cwd ?? this.defaultCwd ?? process.cwd();
    const combinedPrompt = input.systemPrompt + "\n\n" + input.userPrompt;

    const text = await this.execCli(combinedPrompt, cwd, input.signal);
    return { text };
  }

  private execCli(prompt: string, cwd: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("LLM request aborted."));
        return;
      }
      const child = execFile(
        "gh",
        ["copilot", "-p", prompt, "-s", "--no-auto-update"],
        {
          cwd,
          timeout: this.timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
          env: { ...process.env, NO_COLOR: "1" },
        },
        (error, stdout, stderr) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
              reject(
                new Error(
                  'GitHub Copilot CLI is not available. Ensure "gh" is installed and the copilot extension is enabled.',
                ),
              );
              return;
            }
            if (error.killed) {
              reject(
                new Error(
                  `LLM request timed out after ${this.timeoutMs}ms.`,
                ),
              );
              return;
            }
            reject(
              new Error(
                `GitHub Copilot CLI failed: ${stderr || error.message}`,
              ),
            );
            return;
          }
          resolve(stripAnsi(stdout));
        },
      );

      // Kill the child process if the signal is aborted while it's running.
      if (signal) {
        const onAbort = () => {
          child.kill();
          reject(new Error("LLM request aborted."));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        // Clean up the listener when the child exits normally.
        child.on("exit", () => signal.removeEventListener("abort", onAbort));
      }
    });
  }
}
