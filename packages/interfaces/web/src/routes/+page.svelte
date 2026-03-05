<!--
  ISV Web UI — Main page

  Three-panel layout:
  - Left: Project Selector sidebar
  - Center: ISV Calculator (ticket input + results)
  - Right: Calibration Context panel
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProjectEntry, ApiResponse } from '$lib/types/index.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TicketInput from '$lib/components/TicketInput.svelte';
  import TicketInfo from '$lib/components/TicketInfo.svelte';
  import PipelineResults from '$lib/components/PipelineResults.svelte';
  import IsvResult from '$lib/components/IsvResult.svelte';
  import CalibrationPanel from '$lib/components/CalibrationPanel.svelte';
  import ErrorDisplay from '$lib/components/ErrorDisplay.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Card from '$lib/components/Card.svelte';

  // State
  let projects = $state<ProjectEntry[]>([]);
  let activeSlug = $state<string | null>(null);
  let activeProject = $derived(projects.find(p => p.slug === activeSlug) ?? null);

  let loading = $state(false);
  let error = $state<{ code: string; message: string; source?: string } | null>(null);

  // Result state (will be populated when pipeline is integrated)
  let ticketData = $state<Record<string, unknown> | null>(null);
  let pipelineResults = $state<Record<string, unknown> | null>(null);
  let isvResult = $state<Record<string, unknown> | null>(null);
  let calibrationData = $state<Record<string, unknown> | null>(null);

  // Load projects on mount
  onMount(async () => {
    try {
      const res = await fetch('/api/projects');
      const body: ApiResponse<ProjectEntry[]> = await res.json();
      if (body.success && body.data) {
        projects = body.data;
      }
    } catch (e) {
      // Projects failed to load — sidebar will show empty state
      console.warn('[isv-web] Failed to load projects:', e);
    }
  });

  function selectProject(slug: string) {
    // AC-1.3, AC-1.4: Select project, only one active at a time
    // AC-1.5: Reset panels when switching projects
    activeSlug = slug;
    ticketData = null;
    pipelineResults = null;
    isvResult = null;
    calibrationData = null;
    error = null;
  }

  async function handleCalculate(ticketId: string) {
    if (!activeSlug) return;

    loading = true;
    error = null;
    ticketData = null;
    pipelineResults = null;
    isvResult = null;
    calibrationData = null;

    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, projectSlug: activeSlug }),
      });
      const body: ApiResponse<unknown> = await res.json();

      if (!body.success && body.error) {
        error = body.error;
      } else if (body.success && body.data) {
        // When pipeline is fully integrated, populate result sections
        const data = body.data as Record<string, unknown>;
        ticketData = data.ticket as Record<string, unknown> | null;
        pipelineResults = data.pipelineResults as Record<string, unknown> | null;
        isvResult = data.isvResult as Record<string, unknown> | null;
        calibrationData = data.calibration as Record<string, unknown> | null;
      }
    } catch (e) {
      error = {
        code: 'NETWORK_ERROR',
        message: e instanceof Error ? e.message : 'Failed to reach the server',
        source: 'web-ui',
      };
    } finally {
      loading = false;
    }
  }
</script>

<!-- Panel 1: Sidebar -->
<Sidebar {projects} {activeSlug} onselect={selectProject} />

<!-- Panel 2: Center — ISV Calculator -->
<main class="flex min-w-0 flex-1 flex-col overflow-y-auto">
  {#if activeProject}
    <!-- Ticket Input -->
    <div class="sticky top-0 z-10 border-b border-border bg-surface px-6 py-4 shadow-sm">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <h1 class="mb-1 text-lg font-semibold text-text">{activeProject.name}</h1>
          <TicketInput
            ticketPrefix={activeProject.ticketPrefix}
            {loading}
            oncalculate={handleCalculate}
          />
        </div>
      </div>
    </div>

    <!-- Results area -->
    <div class="flex-1 space-y-4 p-6">
      {#if loading}
        <!-- AC-2.4: Skeleton loading states -->
        <Card title="Ticket Information">
          <Skeleton lines={4} />
        </Card>
        <Card title="Status Quo Miner">
          <Skeleton lines={5} />
        </Card>
        <Card title="Architecture Scanner">
          <Skeleton lines={4} />
        </Card>
        <Card title="Gap Analyzer">
          <Skeleton lines={6} />
        </Card>
        <Card title="ISV Result">
          <Skeleton lines={3} />
        </Card>
      {:else if error}
        <!-- AC-2.5: Error display -->
        <ErrorDisplay code={error.code} message={error.message} source={error.source} />
      {:else if isvResult}
        <!-- Full results display -->
        {#if ticketData}
          <TicketInfo ticket={ticketData as any} />
        {/if}
        {#if pipelineResults}
          <PipelineResults pipelineResults={pipelineResults as any} />
        {/if}
        <IsvResult result={isvResult as any} />
      {:else}
        <!-- Initial empty state -->
        <div class="flex flex-1 items-center justify-center py-20">
          <div class="text-center">
            <svg class="mx-auto mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" />
            </svg>
            <h2 class="text-lg font-semibold text-text/60">Ready to Calculate</h2>
            <p class="mt-1 text-sm text-text-secondary/50">
              Enter a ticket number above to start an ISV calculation
            </p>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- No project selected -->
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <svg class="mx-auto mb-4 h-16 w-16 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <h2 class="text-lg font-semibold text-text/60">Select a Project</h2>
        <p class="mt-1 text-sm text-text-secondary/50">
          Choose a project from the sidebar to begin
        </p>
      </div>
    </div>
  {/if}
</main>

<!-- Panel 3: Right — Calibration Context -->
{#if activeProject}
  <aside class="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface-secondary p-4">
    <h2 class="mb-4 text-sm font-semibold tracking-wide text-text-secondary uppercase">Calibration Context</h2>
    {#if loading}
      <div class="space-y-4">
        <Card title="Estimation"><Skeleton lines={2} /></Card>
        <Card title="Time Tracking"><Skeleton lines={2} /></Card>
        <Card title="Code Changes"><Skeleton lines={4} /></Card>
      </div>
    {:else if calibrationData}
      <CalibrationPanel
        storyPoints={(calibrationData as any).storyPoints}
        trackedHours={(calibrationData as any).trackedHours}
        gitChanges={(calibrationData as any).gitChanges}
        plausibilityNarrative={(calibrationData as any).plausibilityNarrative}
        hasData={true}
      />
    {:else}
      <CalibrationPanel hasData={false} />
    {/if}
  </aside>
{/if}
