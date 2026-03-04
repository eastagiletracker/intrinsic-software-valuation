# Types

Shared TypeScript types for the ISV Web UI API layer.

## Purpose

Defines the shape of data exchanged between SvelteKit server routes and client-side Svelte components. These are serializable (JSON-safe) projections of the domain types from `@isv/domain`.

## Contents

| File | Description |
| --- | --- |
| `index.ts` | `ProjectEntry`, `ApiResponse<T>` — core API types |

## How to use

```typescript
import type { ProjectEntry, ApiResponse } from '$lib/types/index.js';
```
