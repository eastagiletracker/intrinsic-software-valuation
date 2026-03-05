# Components

Svelte 5 UI components for the ISV Web UI.

## Purpose

Reusable presentation components that compose the three-panel dashboard layout.

## Contents

| File | Description |
| --- | --- |
| `Sidebar.svelte` | Panel 1 — Collapsible project selector sidebar with icon-rail collapsed state |
| `TicketInput.svelte` | Ticket ID input with prefix label and calculate button |
| `TicketInfo.svelte` | Ticket metadata display (title, type, description, subtasks, comments) |
| `PipelineResults.svelte` | Pipeline step results (Status Quo Miner, Architecture Scanner, Gap Analyzer) |
| `IsvResult.svelte` | Final ISV score with formula breakdown and factor listing |
| `StickyIsvResult.svelte` | Compact sticky ISV result bar fixed at bottom of center panel |
| `CalibrationPanel.svelte` | Panel 3 — Calibration context (story points, hours, Git metrics, plausibility) |
| `Card.svelte` | Reusable card container for result sections |
| `Skeleton.svelte` | Shimmer loading placeholder for skeleton states |
| `ErrorDisplay.svelte` | Error message display with code, message, and source |

## How to use

Import components in Svelte pages or other components:

```svelte
<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
</script>
```
