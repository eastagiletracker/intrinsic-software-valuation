import { readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

import { SystemContextSchema, type SystemContext, type Result } from "@isv/domain";
import type { LlmClient } from "@isv/clients";
import { retryAsync, isLlmStallError } from "@isv/clients";

import type { ArchitectureScannerPort } from "./port.js";

// ---------------------------------------------------------------------------
// LLM output helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from LLM text that may contain markdown fences,
 * preamble text, or trailing commentary.
 */
function extractJson(text: string): string {
  // 1. Try markdown code fences (relaxed: allow missing newline before closing ```)
  const fenceMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. Try plain ``` fences
  const plainFence = text.match(/```\s*\n?([\s\S]*?)\n?\s*```/i);
  if (plainFence) return plainFence[1].trim();

  // 3. Find the outermost { … } block (handles preamble / trailing text)
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text.trim();
}

// ---------------------------------------------------------------------------
// System prompt for LLM
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert software architect. Analyze the provided repository evidence and produce a JSON object matching the SystemContext schema.

You will receive: (1) a directory tree (2-4 levels), (2) key configuration files, (3) a dependency list, (4) targeted source file excerpts categorized as domain models, adapters, and architecture entry points, and (5) an import summary. Use ALL sections to form your analysis.

Output ONLY valid JSON with these fields:
- systemArchetype: one of "HEADLESS_FRONTEND", "CMS_DXP", "MIDDLEWARE", "BACKEND_SERVICE", "UNKNOWN"
- archetypeReasoning: 1-2 sentence justification
- techStack: { languages: string[], frameworks: string[], infrastructure: string[] }
- adapterCatalog: { inbound: [{ protocol: string, description: string }], outbound: [{ systemName: string, integrationType: string }] }
- corePatterns: [{ category: "FRONTEND"|"BACKEND"|"INTEGRATION"|"CMS", patternName: string, description: string }]
- domainModels: string[]

For domainModels: extract business-domain entities representing the application's own data model — NOT framework/SDK base classes. For CMS platforms (e.g. CoreMedia, Magnolia, AEM) extract content types (e.g. Article, Teaser, Page, Download, Video). For backend services extract JPA/ORM entity classes and core domain objects. For frontends extract TypeScript types or interfaces mapping API/CMS content. If the evidence is insufficient, return the best candidates and note uncertainty in archetypeReasoning.

For adapterCatalog: be exhaustive. Check the dependency list and import summary for SDK references to external services (payment providers, CRM, ERP, email marketing, message brokers, cloud services). Each external system the code communicates with must be listed as an outbound adapter, even if you only see its SDK import.

Do NOT include the "repository" field — that is added by the caller.
Be precise and evidence-based. Only report what the code proves.`;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum depth for directory tree traversal. */
const DIR_TREE_MAX_DEPTH = 4;

/** Directories to exclude from tree and file discovery. */
const NOISE_DIRS = new Set([
  "node_modules", "dist", "target", "build", ".git", ".idea", ".vscode",
  "__pycache__", ".next", ".svelte-kit", ".turbo", ".gradle", ".mvn",
  "coverage", ".nyc_output", "out", "bin", ".cache", ".parcel-cache",
]);

/** Budget caps (bytes of UTF-8 text). */
const BUDGET_DIR_TREE = 5_000;
const BUDGET_TARGETED_FILES = 10_000;
const BUDGET_DEPENDENCIES = 3_000;
const BUDGET_TOTAL = 30_000;

/** Per-file content truncation for targeted files. */
const TARGETED_FILE_CHARS = 500;

/** Per-category limits for targeted file discovery. */
const LIMIT_DOMAIN_FILES = 10;
const LIMIT_ADAPTER_FILES = 10;
const LIMIT_ENTRY_POINT_FILES = 5;

/** Max entries for dependency/import lists. */
const LIMIT_DEPENDENCIES = 40;
const LIMIT_IMPORTS = 50;

const KEY_FILES = [
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  "README.md",
  ".env.example",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
];

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".java", ".py", ".go", ".xml",
]);

// ---------------------------------------------------------------------------
// Directory tree builder
// ---------------------------------------------------------------------------

interface TreeEntry {
  name: string;
  isDir: boolean;
  children?: TreeEntry[];
}

async function buildTree(dir: string, depth: number): Promise<TreeEntry[]> {
  if (depth <= 0) return [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sorted = entries
      .filter((e) => !e.name.startsWith(".") || !NOISE_DIRS.has(e.name))
      .filter((e) => !NOISE_DIRS.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const result: TreeEntry[] = [];
    for (const e of sorted) {
      if (e.isDirectory()) {
        const children = await buildTree(join(dir, e.name), depth - 1);
        result.push({ name: e.name, isDir: true, children });
      } else {
        result.push({ name: e.name, isDir: false });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function formatTree(entries: TreeEntry[], indent: string, budget: { remaining: number }): string {
  const lines: string[] = [];
  for (const e of entries) {
    if (budget.remaining <= 0) {
      lines.push(`${indent}… (truncated)`);
      break;
    }
    const icon = e.isDir ? "📁" : "📄";
    const line = `${indent}${icon} ${e.name}`;
    budget.remaining -= line.length + 1; // +1 for newline
    lines.push(line);
    if (e.isDir && e.children && e.children.length > 0) {
      lines.push(formatTree(e.children, indent + "  ", budget));
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

interface DiscoveredFile {
  /** Path relative to workingDir. */
  relPath: string;
  /** Absolute path. */
  absPath: string;
}

/**
 * Recursively list all files, excluding noise directories.
 * Returns paths sorted alphabetically for determinism.
 */
async function listAllFiles(workingDir: string): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = [];
  try {
    const entries = await readdir(workingDir, { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const parentPath = e.parentPath ?? workingDir;
      // Skip noise directories
      const relParent = relative(workingDir, parentPath);
      if (relParent.split("/").some((seg) => NOISE_DIRS.has(seg))) continue;

      const absPath = join(parentPath, e.name);
      const relPath = relative(workingDir, absPath);
      results.push({ relPath, absPath });
    }
  } catch {
    // empty
  }
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return results;
}

function matchesAnyPattern(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

function pathContainsAny(relPath: string, segments: string[]): boolean {
  const lower = relPath.toLowerCase();
  return segments.some((s) => lower.includes(`/${s}/`) || lower.startsWith(`${s}/`));
}

// ---------------------------------------------------------------------------
// Domain model file patterns
// ---------------------------------------------------------------------------

const DOMAIN_PATTERNS_JAVA: RegExp[] = [
  /Entity\.java$/i,
  /Model\.java$/i,
  /Document\.java$/i,
  /contenttype.*\.xml$/i,
  /doctype.*\.xml$/i,
];

const DOMAIN_PATTERNS_TS: RegExp[] = [
  /model\.tsx?$/i,
  /entity\.tsx?$/i,
  /schema\.tsx?$/i,
  /types?\.tsx?$/i,
];

const DOMAIN_PATH_SEGMENTS = [
  "types", "models", "schemas", "entities", "model", "entity",
  "domain", "doctypes", "contenttype", "contenttypes",
];

function isDomainCandidate(file: DiscoveredFile): boolean {
  // Exclude test files
  if (/[/\\](test|__test__|__tests__|spec)[/\\]/i.test(file.relPath)) return false;
  if (/\.test\.|\.spec\./i.test(file.relPath)) return false;

  const name = file.relPath.split("/").pop() ?? "";
  const ext = extname(name);
  if (!SOURCE_EXTENSIONS.has(ext)) return false;

  if (matchesAnyPattern(name, DOMAIN_PATTERNS_JAVA)) return true;
  if (matchesAnyPattern(name, DOMAIN_PATTERNS_TS)) return true;
  if (pathContainsAny(file.relPath, DOMAIN_PATH_SEGMENTS)) return true;

  // Java: *Bean.java in non-test paths (catch CMS content beans)
  if (/Bean\.java$/i.test(name)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Integration/adapter file patterns
// ---------------------------------------------------------------------------

const ADAPTER_PATTERNS_JAVA: RegExp[] = [
  /Client\.java$/i,
  /Adapter\.java$/i,
  /Connector\.java$/i,
  /Processor\.java$/i,
  /Provider\.java$/i,
  /Gateway\.java$/i,
];

const ADAPTER_PATTERNS_TS: RegExp[] = [
  /client\.tsx?$/i,
  /adapter\.tsx?$/i,
  /connector\.tsx?$/i,
  /api\.tsx?$/i,
];

const ADAPTER_PATH_SEGMENTS_JAVA = [
  "integration", "adapter", "client", "connector", "provider", "gateway",
];

const ADAPTER_PATH_SEGMENTS_TS = [
  "integration", "adapter", "client", "api", "services",
];

function isAdapterCandidate(file: DiscoveredFile): boolean {
  if (/[/\\](test|__test__|__tests__|spec)[/\\]/i.test(file.relPath)) return false;
  if (/\.test\.|\.spec\./i.test(file.relPath)) return false;

  const name = file.relPath.split("/").pop() ?? "";
  const ext = extname(name);
  if (!SOURCE_EXTENSIONS.has(ext)) return false;

  // Java: pattern-matched names in adapter-related paths
  if (matchesAnyPattern(name, ADAPTER_PATTERNS_JAVA) &&
      pathContainsAny(file.relPath, ADAPTER_PATH_SEGMENTS_JAVA)) return true;

  // TS: pattern-matched names in adapter-related paths
  if (matchesAnyPattern(name, ADAPTER_PATTERNS_TS) &&
      pathContainsAny(file.relPath, ADAPTER_PATH_SEGMENTS_TS)) return true;

  // Broader: *Client.java or *Client.ts anywhere (strong signal)
  if (/Client\.(java|tsx?)$/i.test(name)) return true;
  // *Adapter.java or *adapter.ts anywhere
  if (/Adapter\.(java|tsx?)$/i.test(name)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Architecture entry point patterns
// ---------------------------------------------------------------------------

const ENTRY_POINT_PATTERNS: RegExp[] = [
  /Controller\.java$/i,
  /Resolver\.java$/i,
  /Handler\.java$/i,
  /Router\.tsx?$/i,
  /routes\.tsx?$/i,
  /\+page\.server\.ts$/,
  /\+server\.ts$/,
];

function isEntryPointCandidate(file: DiscoveredFile): boolean {
  if (/[/\\](test|__test__|__tests__|spec)[/\\]/i.test(file.relPath)) return false;
  if (/\.test\.|\.spec\./i.test(file.relPath)) return false;

  const name = file.relPath.split("/").pop() ?? "";
  return matchesAnyPattern(name, ENTRY_POINT_PATTERNS);
}

// ---------------------------------------------------------------------------
// Dependency extraction
// ---------------------------------------------------------------------------

function extractMavenDependencies(workingDir: string): string[] {
  try {
    const pom = readFileSync(join(workingDir, "pom.xml"), "utf-8");
    const deps: string[] = [];
    // Match <groupId>...</groupId>\s*<artifactId>...</artifactId> inside <dependency> blocks
    const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>/g;
    let m: RegExpExecArray | null;
    while ((m = depRegex.exec(pom)) !== null) {
      deps.push(`${m[1]}:${m[2]}`);
    }
    return [...new Set(deps)].sort().slice(0, LIMIT_DEPENDENCIES);
  } catch {
    return [];
  }
}

function extractNpmDependencies(workingDir: string): string[] {
  try {
    const raw = readFileSync(join(workingDir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = new Set<string>();
    for (const key of ["dependencies", "devDependencies"]) {
      const section = pkg[key];
      if (section && typeof section === "object") {
        for (const name of Object.keys(section as Record<string, unknown>)) {
          deps.add(name);
        }
      }
    }
    return [...deps].sort().slice(0, LIMIT_DEPENDENCIES);
  } catch {
    return [];
  }
}

function extractDependencies(workingDir: string): string[] {
  const maven = extractMavenDependencies(workingDir);
  if (maven.length > 0) return maven;
  return extractNpmDependencies(workingDir);
}

// ---------------------------------------------------------------------------
// Import extraction from file contents
// ---------------------------------------------------------------------------

const IMPORT_REGEX_JAVA = /^(?:import\s+(?:static\s+)?)([\w.]+);/gm;
const IMPORT_REGEX_TS = /(?:^import\s+.*?\s+from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/gm;

function extractImportsFromContent(content: string, ext: string): string[] {
  const imports: string[] = [];
  if (ext === ".java") {
    let m: RegExpExecArray | null;
    const re = new RegExp(IMPORT_REGEX_JAVA.source, "gm");
    while ((m = re.exec(content)) !== null) {
      imports.push(m[1]);
    }
  } else if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    let m: RegExpExecArray | null;
    const re = new RegExp(IMPORT_REGEX_TS.source, "gm");
    while ((m = re.exec(content)) !== null) {
      imports.push(m[1] ?? m[2] ?? m[3]);
    }
  }
  return imports.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Section formatting
// ---------------------------------------------------------------------------

function formatFileExcerpts(files: DiscoveredFile[], limit: number, heading: string): { text: string; imports: string[] } {
  const selected = files.slice(0, limit);
  const allImports: string[] = [];
  const lines: string[] = [`## ${heading}`];

  for (const f of selected) {
    try {
      const content = readFileSync(f.absPath, "utf-8");
      const truncated = content.slice(0, TARGETED_FILE_CHARS);
      lines.push(`### ${f.relPath}\n\`\`\`\n${truncated}\n\`\`\``);
      const ext = extname(f.relPath);
      allImports.push(...extractImportsFromContent(content.slice(0, 3000), ext));
    } catch {
      // skip unreadable
    }
  }

  if (selected.length === 0) {
    lines.push("(none found)");
  }

  return { text: lines.join("\n\n"), imports: allImports };
}

function capSection(text: string, budget: number): string {
  if (Buffer.byteLength(text, "utf-8") <= budget) return text;
  // Truncate to byte budget (cut at last newline before budget)
  const buf = Buffer.from(text, "utf-8");
  const sliced = buf.subarray(0, budget).toString("utf-8");
  const lastNl = sliced.lastIndexOf("\n");
  return (lastNl > 0 ? sliced.slice(0, lastNl) : sliced) + "\n… (truncated)";
}

// ---------------------------------------------------------------------------
// Main sampleDirectory — hybrid strategy
// ---------------------------------------------------------------------------

async function sampleDirectory(workingDir: string): Promise<string> {
  // 1. Deep directory tree
  const tree = await buildTree(workingDir, DIR_TREE_MAX_DEPTH);
  const rawTree = formatTree(tree, "", { remaining: BUDGET_DIR_TREE });
  const dirSection = capSection(
    `## Directory Structure\n${rawTree}`,
    BUDGET_DIR_TREE,
  );

  // 2. Key config files (retained from original)
  const configParts: string[] = [];
  for (const keyFile of KEY_FILES) {
    try {
      const content = readFileSync(join(workingDir, keyFile), "utf-8");
      configParts.push(`### ${keyFile}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``);
    } catch {
      // file not present
    }
  }
  const configSection = configParts.length > 0
    ? `## Key Configuration Files\n\n${configParts.join("\n\n")}`
    : "";

  // 3. Dependencies
  const deps = extractDependencies(workingDir);
  const depsSection = deps.length > 0
    ? capSection(`## Dependencies\n${deps.join("\n")}`, BUDGET_DEPENDENCIES)
    : "";

  // 4. Discover all files once, then categorize
  const allFiles = await listAllFiles(workingDir);

  const domainFiles = allFiles.filter(isDomainCandidate);
  const adapterFiles = allFiles.filter(isAdapterCandidate);
  const entryFiles = allFiles.filter(isEntryPointCandidate);

  // 5. Format targeted file excerpts
  const domainResult = formatFileExcerpts(domainFiles, LIMIT_DOMAIN_FILES, "Domain Model Candidates");
  const adapterResult = formatFileExcerpts(adapterFiles, LIMIT_ADAPTER_FILES, "Integration / Adapter Candidates");
  const entryResult = formatFileExcerpts(entryFiles, LIMIT_ENTRY_POINT_FILES, "Architecture Entry Points");

  const targetedSection = capSection(
    [domainResult.text, adapterResult.text, entryResult.text].join("\n\n"),
    BUDGET_TARGETED_FILES,
  );

  // 6. Import summary
  const allImports = [...domainResult.imports, ...adapterResult.imports, ...entryResult.imports];
  const uniqueImports = [...new Set(allImports)].sort().slice(0, LIMIT_IMPORTS);
  const importSection = uniqueImports.length > 0
    ? capSection(`## Import Summary\n${uniqueImports.join("\n")}`, BUDGET_DEPENDENCIES)
    : "";

  // 7. Assemble with budget enforcement
  const sections = [
    dirSection,
    configSection,
    depsSection,
    targetedSection,
    importSection,
  ].filter(Boolean);

  let assembled = sections.join("\n\n");

  // Enforce total budget — trim trailing sections first
  if (Buffer.byteLength(assembled, "utf-8") > BUDGET_TOTAL) {
    // Rebuild without import summary
    const withoutImports = [dirSection, configSection, depsSection, targetedSection].filter(Boolean).join("\n\n");
    if (Buffer.byteLength(withoutImports, "utf-8") <= BUDGET_TOTAL) {
      assembled = withoutImports;
    } else {
      assembled = capSection(withoutImports, BUDGET_TOTAL);
    }
  }

  return assembled;
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

      // Call LLM with retry for stall errors
      const llmResult = await retryAsync(
        () =>
          llm.prompt({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            temperature: 0.2,
            maxTokens: 4000,
          }),
        {
          maxRetries: 2,
          baseDelayMs: 2_000,
          isStallError: isLlmStallError,
          stallBaseDelayMs: 5_000,
          stallMaxRetries: 3,
          shouldRetry: (err) => isLlmStallError(err),
        },
      );

      if (!llmResult.success) {
        return llmResult;
      }

      // Parse LLM response as JSON
      let rawJson: unknown;
      try {
        const text = extractJson(llmResult.data);
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
        const zodDetails = parsed.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; ");
        return {
          success: false,
          error: {
            code: "ARCH_SCANNER_VALIDATION_FAILED",
            message: `LLM output does not match SystemContext schema: ${zodDetails}`,
            source: "architecture-scanner",
            context: {
              zodErrors: parsed.error.errors,
              rawResponse: llmResult.data.slice(0, 500),
            },
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

export { ArchitectureScannerService, sampleDirectory, extractJson };
