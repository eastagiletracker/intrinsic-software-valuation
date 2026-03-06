import {
  GapAnalysisResultSchema,
  type GapAnalysisResult,
  type SystemBaseline,
  type Ticket,
  type ProjectConfig,
  type Result,
  type ServiceError,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";
import { buildCacheKey, FileCache } from "@isv/clients";

import type { GapAnalyzerPort } from "./port.js";

/**
 * Sentinel class used to distinguish inner-analyzer errors from unexpected
 * exceptions inside `getOrCompute`.
 */
class AnalyzerError {
  constructor(readonly error: ServiceError) {}
}

/**
 * Caching decorator for `GapAnalyzerPort`.
 *
 * Wraps an inner analyzer and caches `analyze()` results keyed by the
 * ticket content and system baseline context — the exact fields that feed
 * into the LLM prompt plus the D3 quality floor.
 *
 * Cached values are validated against `GapAnalysisResultSchema` on read so
 * that stale entries from schema changes auto-miss.
 */
export class CachedGapAnalyzerService implements GapAnalyzerPort {
  private readonly inner: GapAnalyzerPort;
  private readonly cache: FileCache;

  constructor(inner: GapAnalyzerPort, cache: FileCache) {
    this.inner = inner;
    this.cache = cache;
  }

  async analyze(
    baseline: SystemBaseline,
    ticket: Ticket,
    config: ProjectConfig,
    llm: LlmClient,
  ): Promise<Result<GapAnalysisResult>> {
    const key = buildCacheKey("gap-analyzer", "analyze", {
      ticketId: ticket.ticketId,
      ticketType: ticket.type,
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      d3QualityFloor: config.d3QualityFloor,
      repos: baseline.repositories.map((r) => {
        const sc = r.systemContext;
        return {
          repositoryId: sc.repository.repositoryId,
          systemArchetype: sc.systemArchetype,
          languages: sc.techStack.languages,
          frameworks: sc.techStack.frameworks,
          inboundProtocols: sc.adapterCatalog.inbound.map((a) => a.protocol),
          outboundSystems: sc.adapterCatalog.outbound.map((a) => a.systemName),
          patterns: sc.corePatterns.map((p) => p.patternName),
          domainModels: sc.domainModels,
        };
      }),
    });

    try {
      const cached = await this.cache.getOrCompute<GapAnalysisResult>(
        key,
        async () => {
          const result = await this.inner.analyze(
            baseline,
            ticket,
            config,
            llm,
          );
          if (!result.success) {
            throw new AnalyzerError(result.error);
          }
          return result.data;
        },
        GapAnalysisResultSchema,
      );

      return { success: true, data: cached };
    } catch (err) {
      if (err instanceof AnalyzerError) {
        return { success: false, error: err.error };
      }
      throw err;
    }
  }
}
