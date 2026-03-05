// Jira ticket client — port (stable interface) and adapter implementations.
export type { TicketPort } from "./port.js";
export { JiraXmlAdapter } from "./jira-xml/index.js";

// High-level client, schemas, and factory.
export type { TicketClient } from "./client.js";
export {
  TicketRawFormatSchema,
  type TicketRawFormat,
} from "./raw-format.schema.js";
export {
  TicketClientConfigSchema,
  type TicketClientConfig,
} from "./client-config.schema.js";
export { TicketQuerySchema, type TicketQuery } from "./query.schema.js";
export { createTicketClient } from "./factory.js";
export { CachedTicketClient } from "./cached-ticket-client.js";
