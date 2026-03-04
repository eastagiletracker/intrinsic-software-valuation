import { describe, it, expect, vi } from "vitest";
import {
  StructuralFactsSchema,
  HealthScoresSchema,
} from "@isv/domain";

import type { StaticAnalysisPort, SccResult, JscpdResult, KnipResult } from "./port.js";
import { createStaticAnalysisClient, mapStructuralFacts, mapHealthScores } from "./factory.js";

// derived from: __fixtures__/scc-output.json
const mockScc: SccResult = {
  totalLinesOfCode: 13200,
  totalFiles: 180,
  avgCyclomaticComplexity: 3.5,
  godClassCount: 0,
};

// derived from: __fixtures__/jscpd-output.json
const mockJscpd: JscpdResult = {
  duplicationPercentage: 5.0,
};

// derived from: __fixtures__/knip-output.json
const mockKnip: KnipResult = {
  deadCodeFiles: 3,
};

const mockPort: StaticAnalysisPort = {
  scc: vi.fn().mockResolvedValue(mockScc),
  jscpd: vi.fn().mockResolvedValue(mockJscpd),
  knip: vi.fn().mockResolvedValue(mockKnip),
};

describe("StaticAnalysisClient factory", () => {
  it("creates a client that calls all three port methods", async () => {
    const client = createStaticAnalysisClient(mockPort);
    const result = await client.analyze("/test/repo");

    expect(mockPort.scc).toHaveBeenCalledWith("/test/repo");
    expect(mockPort.jscpd).toHaveBeenCalledWith("/test/repo");
    expect(mockPort.knip).toHaveBeenCalledWith("/test/repo");
    expect(result.structuralFacts).toBeDefined();
    expect(result.healthScores).toBeDefined();
  });

  it("returns schema-valid StructuralFacts", async () => {
    const client = createStaticAnalysisClient(mockPort);
    const { structuralFacts } = await client.analyze("/test/repo");

    const parsed = StructuralFactsSchema.safeParse(structuralFacts);
    expect(parsed.success).toBe(true);
  });

  it("returns schema-valid HealthScores", async () => {
    const client = createStaticAnalysisClient(mockPort);
    const { healthScores } = await client.analyze("/test/repo");

    const parsed = HealthScoresSchema.safeParse(healthScores);
    expect(parsed.success).toBe(true);
  });
});

describe("mapping helpers", () => {
  it("mapStructuralFacts produces correct volume metrics", () => {
    const facts = mapStructuralFacts(mockScc);
    expect(facts.volume.totalLinesOfCode).toBe(13200);
    expect(facts.volume.totalFiles).toBe(180);
  });

  it("mapStructuralFacts initialises entry points to zero", () => {
    const facts = mapStructuralFacts(mockScc);
    expect(facts.entryPoints.controllers).toBe(0);
    expect(facts.entryPoints.views).toBe(0);
  });

  it("mapHealthScores produces correct complexity metrics", () => {
    const scores = mapHealthScores(mockScc, mockJscpd, mockKnip);
    expect(scores.complexity.avgCyclomaticComplexity).toBeCloseTo(3.5);
    expect(scores.complexity.duplicationPercentage).toBe(5.0);
    expect(scores.complexity.godClassCount).toBe(0);
  });

  it("mapHealthScores produces correct test health", () => {
    const scores = mapHealthScores(mockScc, mockJscpd, mockKnip);
    expect(scores.testHealth.deadCodeFiles).toBe(3);
    expect(scores.testHealth.coveragePercentage).toBeUndefined();
    expect(scores.testHealth.outdatedDependencies).toBe(0);
  });
});
