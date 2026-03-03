# ISV Engine: Architecture Scanner (Fact Finder)

## Purpose and Context

Before the Gap Analyzer can evaluate a change request and calculate the Intrinsic Software Value (ISV), it needs a reliable machine-readable baseline of the current system.

The Architecture Scanner (Fact Finder) analyzes source repositories (`n` repositories) and abstracts the existing architecture.

- Goal: Determine what the software is structurally capable of (system capabilities, established patterns, external integrations).
- Out of scope: Static code analysis (lines of code, test coverage, cyclomatic complexity). These are collected separately.
- Result: A machine-readable `system_context.json` used by the Gap Analyzer to distinguish standard tasks from architectural extensions.

## Extraction Prompt (System Prompt)

This prompt is passed to a Large Language Model (LLM), which analyzes the code via RAG, direct upload, or context window.

### Start of Prompt

Role and goal:

You are a Principal Software Architect. Your task is to analyze the source code of the provided repository and create highly condensed, abstract architecture documentation (the system context).

Your goal is to capture structural capabilities so that new requirements can later be evaluated against existing patterns and integrations.

Ignore:

Static code analysis (lines of code, cyclomatic complexity, test coverage). Focus only on architectural decisions, patterns, and integrations.

Extraction instructions:

1. System archetype (system classification)
   - Determine the primary system type.
   - Choose one: Headless Frontend, CMS/DXP, Middleware/Integration, Backend Service, or Unknown.
   - Justify in 1–2 sentences.
2. Tech stack and frameworks
   - Extract main languages, core frameworks (for example Next.js, Spring Boot, Magnolia), and infrastructure concepts.
3. Adapter catalog (inbound and outbound communication)
   - Inbound: How is the system called (REST API, webhooks, GraphQL, event subscription)?
   - Outbound: Which external systems or APIs are consumed (for example Stripe, Salesforce, headless CMS)?
4. Core patterns and capabilities
   - Identify architecture patterns relevant to system type.
   - Frontend/UI examples: SSR, state management, UI library, accessibility concepts.
   - Backend/integration examples: event-driven messaging, API throttling, background worker.
   - CMS/platform examples: custom modules, modified workflows.
5. Domain models or content types
   - Backends: central entities (for example Order, User).
   - CMS: central content types (for example Article, Landing Page).
   - Note: For pure middleware or UI frontends, this can be empty.

Output format (critical):

Return valid JSON only. Use exactly the provided TypeScript structure. Do not add explanations outside the JSON.

### End of Prompt

## Output Format (JSON Schema)

To ensure deterministic and error-free automation, the model output should strictly follow this schema in `system_context.json`.

```typescript
interface SystemContext {
  systemArchetype: "HEADLESS_FRONTEND" | "CMS_DXP" | "MIDDLEWARE" | "BACKEND_SERVICE" | "UNKNOWN";
  archetypeReasoning: string;

  techStack: {
    languages: string[];
    frameworks: string[];
    infrastructure: string[];
  };

  adapterCatalog: {
    inbound: {
      protocol: string;
      description: string;
    }[];
    outbound: {
      systemName: string;
      integrationType: string;
    }[];
  };

  corePatterns: {
    category: "FRONTEND" | "BACKEND" | "INTEGRATION" | "CMS";
    patternName: string;
    description: string;
  }[];

  domainModels: string[];
}
```