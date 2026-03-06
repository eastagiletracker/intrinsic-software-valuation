import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { sampleDirectory } from "./service.js";

// Fixture: synthetic Java + TS project with noise dirs
const FIXTURE_DIR = resolve(
  import.meta.dirname,
  "__fixtures__",
  "sample-repo",
);

describe("sampleDirectory — Tier 1 unit tests", () => {
  // --- AC-1: Deep directory tree ---

  it("includes a directory structure section with multi-level depth", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Directory Structure");
    // Should see nested directories (at least level 2)
    expect(result).toContain("src");
    expect(result).toContain("frontend");
  });

  it("excludes noise directories from tree (node_modules, dist, .git)", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).not.toContain("node_modules");
    expect(result).not.toContain("📁 dist");
    expect(result).not.toContain("📁 .git");
  });

  // --- AC-2: Targeted file discovery ---

  it("discovers domain model candidates", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Domain Model Candidates");
    expect(result).toContain("OrderEntity.java");
    expect(result).toContain("CustomerEntity.java");
    // TS types in types/ folder
    expect(result).toContain("product.types.ts");
  });

  it("discovers adapter/integration candidates", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Integration / Adapter Candidates");
    expect(result).toContain("StripePaymentClient.java");
    expect(result).toContain("SendGridEmailAdapter.java");
    // TS client in api/ folder
    expect(result).toContain("product.client.ts");
  });

  it("discovers architecture entry points", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Architecture Entry Points");
    expect(result).toContain("OrderController.java");
  });

  it("does not include files from noise directories in targeted discovery", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).not.toContain("fake-pkg");
    expect(result).not.toContain("dist/compiled");
  });

  // --- AC-3: Dependency extraction ---

  it("extracts Maven dependencies from pom.xml", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Dependencies");
    expect(result).toContain("org.springframework.boot:spring-boot-starter-web");
    expect(result).toContain("com.stripe:stripe-java");
    expect(result).toContain("com.sendgrid:sendgrid-java");
  });

  // --- AC-4: Key config files ---

  it("includes key configuration files", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Key Configuration Files");
    expect(result).toContain("pom.xml");
    expect(result).toContain("<groupId>com.example</groupId>");
  });

  // --- AC-5: Import summary ---

  it("includes an import summary from targeted files", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    expect(result).toContain("## Import Summary");
    // Java imports from domain entities
    expect(result).toContain("javax.persistence");
    // Java imports from adapters
    expect(result).toContain("com.stripe");
  });

  // --- AC-6: Budget enforcement ---

  it("stays within 30KB total budget", async () => {
    const result = await sampleDirectory(FIXTURE_DIR);
    const bytes = Buffer.byteLength(result, "utf-8");
    expect(bytes).toBeLessThanOrEqual(30_000);
  });

  // --- AC-7: Determinism ---

  it("produces the same output across consecutive runs", async () => {
    const run1 = await sampleDirectory(FIXTURE_DIR);
    const run2 = await sampleDirectory(FIXTURE_DIR);
    expect(run1).toBe(run2);
  });
});
