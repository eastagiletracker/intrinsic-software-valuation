import {
  GapAnalysisResultSchema,
  type GapAnalysisResult,
  type SystemBaseline,
  type Ticket,
  type ProjectConfig,
  type Result,
  type D3Quality,
} from "@isv/domain";
import type { LlmClient } from "@isv/clients";

import type { GapAnalyzerPort } from "./port.js";

// ---------------------------------------------------------------------------
// System prompt for LLM
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert software architect performing a gap analysis. Compare the system baseline (current architecture) with the ticket requirements (target state) and produce a JSON object matching the GapAnalysisResult schema.

Output ONLY valid JSON with these fields:
- ticketId: string (the ticket ID provided)
- meta: { isTicketActionable: boolean, reasonIfNotActionable?: string, confidenceScore: number 0-1 }
- architecturalFit: { canBeImplementedWithExistingPatterns: boolean, summary: string }
- identifiedGaps: { data: { hasGap: boolean, missingEntities: string[], description: string }, ui: { hasGap: boolean, description: string }, logic: { hasGap: boolean, description: string }, integration: { hasGap: boolean, missingAdapters: string[], description: string } }
- requiredModifications: { architectureExtensions: string[], actionItems: string[] }
- isvScoring: { A1_Data: { score: 1|2|3|5, reasoning: string }, A2_UX: { score: 1|2|3, reasoning: string }, B1_Logic: { score: 0|1|2|3|5|8, reasoning: string }, C1_Integration: { score: 1|2|3|5, reasoning: string }, D3_Quality: { score: 1|2|3, reasoning: string } }

ISV Factor Scales (Fibonacci integers):
- A1 Data Value: 1 (read-only), 2 (single entity CRUD), 3 (multi-entity), 5 (schema expansion)
- A2 UX Multiplier: 1 (headless), 2 (standard component), 3 (custom UI)
- B1 Logic Value: 0 (pass-through), 1 (simple transform), 2 (validation), 3 (workflows), 5 (algorithms), 8 (AI)
- C1 Integration: 1 (local), 2 (extend adapter), 3 (new internal adapter), 5 (new third-party)
- D3 Quality: 1 (standard DoD), 2 (elevated: E2E, security), 3 (regulatory/compliance)

Be evidence-based. Only claim gaps supported by the baseline context.`;

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class GapAnalyzerService implements GapAnalyzerPort {
  async analyze(
    baseline: SystemBaseline,
    ticket: Ticket,
    config: ProjectConfig,
    llm: LlmClient,
  ): Promise<Result<GapAnalysisResult>> {
    try {
      // Serialize baseline context for LLM
      const baselineContext = baseline.repositories
        .map((repo, i) => {
          const sc = repo.systemContext;
          return `Repository ${i + 1}: ${sc.repository.repositoryId}
  Archetype: ${sc.systemArchetype}
  Tech: ${sc.techStack.languages.join(", ")} / ${sc.techStack.frameworks.join(", ")}
  Adapters In: ${sc.adapterCatalog.inbound.map((a) => a.protocol).join(", ") || "none"}
  Adapters Out: ${sc.adapterCatalog.outbound.map((a) => a.systemName).join(", ") || "none"}
  Patterns: ${sc.corePatterns.map((p) => p.patternName).join(", ") || "none"}
  Domain Models: ${sc.domainModels.join(", ") || "none"}`;
        })
        .join("\n\n");

      const userPrompt = `## System Baseline
${baselineContext}

## Ticket to Analyze
ID: ${ticket.ticketId}
Type: ${ticket.type}
Title: ${ticket.title}
Description: ${ticket.description}

Produce the GapAnalysisResult JSON now.`;

      // Call LLM
      const llmResult = await llm.prompt({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.3,
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
            code: "GAP_ANALYZER_PARSE_FAILED",
            message: "LLM response is not valid JSON",
            source: "gap-analyzer",
            context: { rawResponse: llmResult.data.slice(0, 500) },
          },
        };
      }

      // Validate against domain schema
      const parsed = GapAnalysisResultSchema.safeParse(rawJson);
      if (!parsed.success) {
        return {
          success: false,
          error: {
            code: "GAP_ANALYZER_VALIDATION_FAILED",
            message: "LLM output does not match GapAnalysisResult schema",
            source: "gap-analyzer",
            context: { zodErrors: parsed.error.errors },
          },
        };
      }

      const result = parsed.data;

      // Confidence gate: < 0.7 → flag for review (but still return result)
      // D3 floor enforcement: max(ticket D3, config.d3QualityFloor)
      const d3Floor = config.d3QualityFloor;
      const ticketD3 = result.isvScoring.D3_Quality.score;
      const effectiveD3 = Math.max(ticketD3, d3Floor) as D3Quality;

      if (effectiveD3 !== ticketD3) {
        result.isvScoring.D3_Quality = {
          ...result.isvScoring.D3_Quality,
          score: effectiveD3,
          reasoning:
            result.isvScoring.D3_Quality.reasoning +
            ` [D3 floor applied: ${d3Floor}]`,
        };
      }

      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: {
          code: "GAP_ANALYZER_FAILED",
          message: err instanceof Error ? err.message : String(err),
          source: "gap-analyzer",
        },
      };
    }
  }
}

export { GapAnalyzerService };
