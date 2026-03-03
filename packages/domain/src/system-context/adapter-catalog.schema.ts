import { z } from "zod";

/**
 * Inbound adapter — how the system is called from outside.
 */
export const InboundAdapterSchema = z
  .object({
    protocol: z
      .string()
      .min(1)
      .describe(
        "Communication protocol or pattern, e.g. 'REST API', 'GraphQL', 'webhook', 'event subscription'",
      ),
    description: z
      .string()
      .describe("Brief description of what this inbound adapter exposes"),
  })
  .describe(
    "An inbound communication endpoint: how the system receives requests from the outside world.",
  );

export type InboundAdapter = z.infer<typeof InboundAdapterSchema>;

/**
 * Outbound adapter — which external systems or APIs are consumed.
 */
export const OutboundAdapterSchema = z
  .object({
    systemName: z
      .string()
      .min(1)
      .describe(
        "Name of the external system, e.g. 'Stripe', 'Salesforce', 'PostgreSQL'",
      ),
    integrationType: z
      .string()
      .min(1)
      .describe(
        "How the integration works, e.g. 'REST API', 'SDK', 'database driver', 'message queue'",
      ),
  })
  .describe(
    "An outbound integration: an external system or API consumed by this repository.",
  );

export type OutboundAdapter = z.infer<typeof OutboundAdapterSchema>;

/**
 * Full adapter catalog of a repository.
 *
 * Lists all inbound (how the system is called) and outbound (what the system calls)
 * integration points. The Gap Analyzer uses this to detect missing adapters
 * when a new requirement introduces a new third-party dependency.
 */
export const AdapterCatalogSchema = z
  .object({
    inbound: z
      .array(InboundAdapterSchema)
      .describe("All inbound communication endpoints"),
    outbound: z
      .array(OutboundAdapterSchema)
      .describe("All outbound integrations with external systems"),
  })
  .describe(
    "Catalog of all inbound and outbound adapters for a repository. " +
      "Used to detect integration gaps when evaluating new requirements.",
  );

export type AdapterCatalog = z.infer<typeof AdapterCatalogSchema>;
