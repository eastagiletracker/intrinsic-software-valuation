# LLM

Provider-agnostic LLM client with swappable adapters for sending structured prompts and receiving text responses.

## Purpose

Provides a high-level `LlmClient` that abstracts LLM provider details, exposing a simple text-in / text-out interface. Domain-specific prompt construction and response parsing belong to the service layer — the client only handles transport and connection.

## Contents overview

| File / Folder | Description |
|---|---|
| `port.ts` | `LlmPort` interface — source-agnostic contract for LLM adapters |
| `client.ts` | `LlmClient` interface — high-level API returning `Result<string>` |
| `factory.ts` | `createLlmClient(config)` — factory that resolves the correct adapter |
| `provider.schema.ts` | `LlmProviderSchema` — Zod enum of supported LLM providers |
| `client-config.schema.ts` | `LlmClientConfigSchema` — configuration for the factory |
| `query.schema.ts` | `LlmQuerySchema` — structured query with system/user prompts |
| `index.ts` | Public re-exports for the module |
| `github-copilot-cli/` | Adapter for GitHub Copilot CLI (`gh copilot`) |

## How to use

```typescript
import { createLlmClient } from "@isv/clients";

const client = createLlmClient({
  provider: "github-copilot-cli",
});

const result = await client.prompt({
  systemPrompt: "You are an architecture scanner. Return JSON.",
  userPrompt: "Analyze the following repository source code...",
});

if (result.success) {
  console.log(result.data); // raw LLM text response
} else {
  console.error(result.error); // ServiceError
}
```

### With optional parameters

```typescript
const result = await client.prompt({
  systemPrompt: "You are a gap analyzer.",
  userPrompt: "Compare the system context with these tickets...",
  temperature: 0.3,
  maxTokens: 4096,
  cwd: "/path/to/repository",
});
```

## Testing

See [`docs/qa-strategy.md`](../../../../../docs/qa-strategy.md) for the full strategy and rules.

Current state: Tier 1 unit tests and Tier 4 realworld test are in place. Tier 2 adapter fixture and Tier 3 boundary tests are pending (no `__fixtures__/` yet).
