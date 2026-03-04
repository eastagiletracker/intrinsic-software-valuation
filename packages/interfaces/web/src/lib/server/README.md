# Server Utilities

Server-side modules for the ISV Web UI.

## Purpose

Contains server-only logic that runs in SvelteKit server routes. These modules are not bundled into the client-side JavaScript.

## Contents

| File | Description |
| --- | --- |
| `projects.ts` | Scans `data/` directory for project subdirectories with valid `project-config.json` |

## How to use

Import in SvelteKit server routes (`+server.ts` or `+page.server.ts`):

```typescript
import { listProjects } from '$lib/server/projects.js';
```
