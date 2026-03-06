# Server Utilities

Server-side modules for the ISV Web UI.

## Purpose

Contains server-only logic that runs in SvelteKit server routes. These modules are not bundled into the client-side JavaScript.

## Contents

| File | Description |
| --- | --- |
| `projects.ts` | Scans `data/` directory for project subdirectories with valid `project-config.json` |
| `paths.ts` | Resolves shared monorepo paths used by server-only modules |
| `reports.ts` | Lists and reads calibration reports; resolves cluster-level cache deep-dive artifacts |

## How to use

Import in SvelteKit server routes (`+server.ts` or `+page.server.ts`):

```typescript
import { listProjects } from '$lib/server/projects.js';
```
