// Shared atoms, branded types, and cross-cutting patterns.
// These are building blocks used by all domain modules.

export {
  ConfidenceScoreSchema,
  type ConfidenceScore,
} from "./confidence-score.schema.js";

export {
  ScoredFactorSchema,
  type ScoredFactor,
} from "./scored-factor.schema.js";

export { TicketIdSchema, type TicketId } from "./ticket-id.schema.js";

export {
  IsoTimestampSchema,
  type IsoTimestamp,
} from "./iso-timestamp.schema.js";

export {
  RepositoryRefSchema,
  type RepositoryRef,
} from "./repository-ref.schema.js";

export {
  A1DataScale,
  type A1Data,
  A2UxScale,
  type A2Ux,
  B1LogicScale,
  type B1Logic,
  C1IntegrationScale,
  type C1Integration,
  C2StateScale,
  type C2State,
  D3QualityScale,
  type D3Quality,
} from "./isv-factor-scales.schema.js";

export {
  ServiceErrorSchema,
  type ServiceError,
} from "./service-error.schema.js";

export { ServiceException } from "./service-exception.js";

export { createResultSchema, type Result } from "./result.schema.js";

export {
  ProjectConfigSchema,
  type ProjectConfig,
} from "./project-config.schema.js";
