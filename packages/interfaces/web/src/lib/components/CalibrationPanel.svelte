<!--
  Panel 3 — Calibration Context (AC-3.1 through AC-3.5).

  Shows historical calibration data and plausibility context:
  - Story points
  - Tracked hours
  - Git change metrics
  - LLM plausibility narrative
-->
<script lang="ts">
  import Card from './Card.svelte';

  let {
    storyPoints,
    trackedHours,
    gitChanges,
    plausibilityNarrative,
    hasData = false,
  }: {
    storyPoints?: number;
    trackedHours?: number;
    gitChanges?: {
      locAdded: number;
      locDeleted: number;
      filesChanged: number;
      distributionEntropy: number;
      cyclomaticComplexityDelta: number;
      changeIntensityScore: number;
    };
    plausibilityNarrative?: string;
    hasData?: boolean;
  } = $props();
</script>

<div class="space-y-4">
  <!-- Story Points (AC-3.1) -->
  <Card title="Estimation">
    {#if storyPoints !== undefined}
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 items-center justify-center rounded-lg bg-brand/10">
          <span class="text-xl font-bold text-brand">{storyPoints}</span>
        </span>
        <div>
          <p class="text-sm font-medium text-text">Story Points</p>
          <p class="text-xs text-text-secondary">From ticket estimation</p>
        </div>
      </div>
    {:else}
      <p class="text-sm text-text-secondary/50">No story point estimate available</p>
    {/if}
  </Card>

  <!-- Tracked Hours (AC-3.2) -->
  <Card title="Time Tracking">
    {#if trackedHours !== undefined}
      <div class="flex items-center gap-3">
        <span class="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-red-extra-light">
          <span class="text-xl font-bold text-accent-red">{trackedHours.toFixed(1)}</span>
        </span>
        <div>
          <p class="text-sm font-medium text-text">Hours tracked</p>
          <p class="text-xs text-text-secondary">Total for ticket / ticket group</p>
        </div>
      </div>
    {:else}
      <!-- AC-3.5: Informational empty state -->
      <p class="text-sm text-text-secondary/50">No time tracking data available</p>
    {/if}
  </Card>

  <!-- Git Changes (AC-3.3) -->
  <Card title="Code Changes">
    {#if gitChanges}
      <div class="space-y-2 text-sm">
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Lines added</p>
            <p class="font-mono font-bold text-green-600">+{gitChanges.locAdded.toLocaleString()}</p>
          </div>
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Lines deleted</p>
            <p class="font-mono font-bold text-accent-red">-{gitChanges.locDeleted.toLocaleString()}</p>
          </div>
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Files changed</p>
            <p class="font-mono font-bold text-text">{gitChanges.filesChanged}</p>
          </div>
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Distribution entropy</p>
            <p class="font-mono font-bold text-text">{gitChanges.distributionEntropy.toFixed(2)}</p>
          </div>
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Complexity Δ</p>
            <p class="font-mono font-bold {gitChanges.cyclomaticComplexityDelta >= 0 ? 'text-accent-red' : 'text-green-600'}">
              {gitChanges.cyclomaticComplexityDelta >= 0 ? '+' : ''}{gitChanges.cyclomaticComplexityDelta}
            </p>
          </div>
          <div class="rounded-lg bg-surface-secondary px-3 py-2">
            <p class="text-xs text-text-secondary">Change intensity</p>
            <p class="font-mono font-bold text-text">{(gitChanges.changeIntensityScore * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>
    {:else}
      <!-- AC-3.5: Informational empty state -->
      <p class="text-sm text-text-secondary/50">No code changes found for this ticket</p>
    {/if}
  </Card>

  <!-- Plausibility Narrative (AC-3.4) -->
  {#if plausibilityNarrative}
    <Card title="Plausibility Assessment">
      <p class="text-sm leading-relaxed text-text">{plausibilityNarrative}</p>
    </Card>
  {/if}

  <!-- Empty state when no calibration data at all (AC-3.5) -->
  {#if !hasData && !storyPoints && !trackedHours && !gitChanges}
    <div class="rounded-xl border border-dashed border-border p-6 text-center">
      <svg class="mx-auto mb-3 h-8 w-8 text-text-secondary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
      <p class="text-sm text-text-secondary/50">
        No calibration context available.<br />
        Run the Historical Calibration Pipeline first to see context data here.
      </p>
    </div>
  {/if}
</div>
