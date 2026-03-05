import { readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SystemContextSchema, type SystemContext, type Result } from "@isv/domain";
import type { LlmClient } from "@isv/clients";

import type { ArchitectureScannerPort } from "./port.js";

// ---------------------------------------------------------------------------
// System prompt for LLM
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert software architect. Analyze the provided repository file listing and sample file contents, then produce a JSON object matching the SystemContext schema.

Output ONLY valid JSON with these fields:
- systemArchetype: one of "HEADLESS_FRONTEND", "CMS_DXP", "MIDDLEWARE", "BACKEND_SERVICE", "UNKNOWN"
- archetypeReasoning: 1-2 sentence justification
- techStack: { languages: string[], frameworks: string[], infrastructure: string[] }
- adapterCatalog: { inbound: [{ protocol: string, description: string }], outbound: [{ systemName: string, integrationType: string }] }
- corePatterns: [{ category: "FRONTEND"|"BACKEND"|"INTEGRATION"|"CMS", patternName: string, description: string }]
- domainModels: string[]

Do NOT include the "repository" field — that is added by the caller.
Be precise and evidence-based. Only report what the code proves.`;

// ---------------------------------------------------------------------------
// Directory sampling
// ---------------------------------------------------------------------------

const KEY_FILES = [
  "package.json",
  "pom.xml",
  "build.gradle",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  "README.md",
  ".env.example",
];

const SAMPLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".java", ".py", ".go"];

async function sampleDirectory(workingDir: string): Promise<string> {
  const parts: string[] = [];

  // List top-level structure
  try {
    const topLevel = await readdir(workingDir, { withFileTypes: true });
    parts.push(
      "## Directory Structure (top level)\n" +
        topLevel.map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n"),
    );
  } catch {
    // ignore
  }

  // Read key configuration files
  for (const keyFile of KEY_FILES) {
    try {
      const content = readFileSync(join(workingDir, keyFile), "utf-8");
      parts.push(`## ${keyFile}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``);
    } catch {
      // file not present
    }
  }

  // Sample a few source files
  try {
    const allFiles = await readdir(workingDir, {
      recursive: true,
      withFileTypes: true,
    });
    const sourceFiles = allFiles
      .filter(
        (e) =>
          e.isFile() &&
          SAMPLE_EXTENSIONS.some((ext) => e.name.endsWith(ext)) &&
          !e.parentPath?.includes("node_modules") &&
          !e.parentPath?.includes("dist"),
      )
      .slice(0, 5);

    for (const sf of sourceFiles) {
      try {
        const fullPath = join(sf.parentPath ?? workingDir, sf.name);
        const content = readFileSync(fullPath, "utf-8");
        parts.push(
          `## ${sf.name}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``,
        );
      } catch {
        // skip unreadable
      }
    }
  } catch {
    // ignore
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class ArchitectureScannerService implements ArchitectureScannerPort {
  async scan(
    workingDir: string,
    llm: LlmClient,
  ): Promise<Result<SystemContext>> {
    try {
      // Build user prompt from directory contents
      const dirSample = await sampleDirectory(workingDir);
      const userPrompt = `Analyze this repository and produce a SystemContext JSON:\n\n${dirSample}`;

      // Call LLM
      const llmResult = await llm.prompt({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.2,
        maxTokens: 4000,
      });

      if (!llmResult.success) {
        return llmResult;
      }

      // Parse LLM response as JSON
      let rawJson: unknown;
      try {
        // Handle markdown code fences around JSON, possibly with preamble text
        let text = llmResult.data;
        const fenceMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/i);
        if (fenceMatch) {
          text = fenceMatch[1];
        } else {
          text = text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
        }
        rawJson = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: {
            code: "ARCH_SCANNER_PARSE_FAILED",
            message: "LLM response is not valid JSON",
            source: "architecture-scanner",
            context: { rawResponse: llmResult.data.slice(0, 500) },
          },
        };
      }

      // Extract repositoryId from the directory name
      const repositoryId = workingDir.split("/").filter(Boolean).pop() ?? "unknown";

      // Inject the repository field that the LLM doesn't produce
      const withRepo = {
        ...(rawJson as Record<string, unknown>),
        repository: { repositoryId },
      };

      // Validate against domain schema
      const parsed = SystemContextSchema.safeParse(withRepo);
      if (!parsed.success) {
        return {
          success: false,
          error: {
            code: "ARCH_SCANNER_VALIDATION_FAILED",
            message: "LLM output does not match SystemContext schema",
            source: "architecture-scanner",
            context: { zodErrors: parsed.error.errors },
          },
        };
      }

      return { success: true, data: parsed.data };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "ARCH_SCANNER_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "architecture-scanner",
        },
      };
    }
  }
}

export { ArchitectureScannerService };
