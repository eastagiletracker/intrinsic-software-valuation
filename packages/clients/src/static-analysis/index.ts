// Static analysis client adapter (scc, jscpd, knip)
export type { SccResult, JscpdResult, KnipResult, StaticAnalysisPort } from "./port.js";
export type { StaticAnalysisClient } from "./client.js";
export { CliStaticAnalysisAdapter } from "./cli-static-analysis.adapter.js";
export { createStaticAnalysisClient, mapStructuralFacts, mapHealthScores } from "./factory.js";
export { parseSccOutput } from "./scc-adapter.js";
export { parseJscpdOutput } from "./jscpd-adapter.js";
export { parseKnipOutput } from "./knip-adapter.js";
