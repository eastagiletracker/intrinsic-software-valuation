<!--
  ISV Web UI — Main page

  Three-panel layout:
  - Left: Project Selector sidebar (collapsible)
  - Center: ISV Calculator (ticket input + results + sticky ISV bar)
  - Right: Calibration Context panel

  Calculation uses SSE streaming via EventSource for incremental progress.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProjectEntry, ApiResponse, PipelineStepState, PipelineStepStatus } from '$lib/types/index.js';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TicketInput from '$lib/components/TicketInput.svelte';
  import TicketInfo from '$lib/components/TicketInfo.svelte';
  import PipelineResults from '$lib/components/PipelineResults.svelte';
  import IsvResult from '$lib/components/IsvResult.svelte';
  import StickyIsvResult from '$lib/components/StickyIsvResult.svelte';
  import CalibrationPanel from '$lib/components/CalibrationPanel.svelte';
  import ErrorDisplay from '$lib/components/ErrorDisplay.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Card from '$lib/components/Card.svelte';
  import PipelineProgress from '$lib/components/PipelineProgress.svelte';

  // ---------------------------------------------------------------------------
  // Pipeline step definitions
  // ---------------------------------------------------------------------------

  const STEP_DEFINITIONS: Array<{ id: string; label: string; aiAssisted?: boolean }> = [
    { id: 'ticket-fetched', label: 'Fetching ticket' },
    { id: 'repos-checked-out', label: 'Checking out repositories' },
    { id: 'code-health-mined', label: 'Analyzing code health' },
    { id: 'architecture-scanned', label: 'Scanning architecture', aiAssisted: true },
    { id: 'c2-derived', label: 'Deriving C2 — State Factor (technical debt)' },
    { id: 'gap-analyzed', label: 'Analyzing requirements gap', aiAssisted: true },
    { id: 'factors-assembled', label: 'Assembling ISV factors' },
    { id: 'isv-calculated', label: 'Calculating ISV score' },
  ];

  function createInitialSteps(): PipelineStepState[] {
    return STEP_DEFINITIONS.map(def => ({
      ...def,
      status: 'pending' as PipelineStepStatus,
    }));
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let projects = $state<ProjectEntry[]>([]);
  let activeSlug = $state<string | null>(null);
  let activeProject = $derived(projects.find(p => p.slug === activeSlug) ?? null);

  let loading = $state(false);
  let error = $state<{ code: string; message: string; source?: string } | null>(null);

  // Sidebar collapsed state (AC-UI-1)
  let sidebarCollapsed = $state(false);

  // Result state
  let ticketData = $state<Record<string, unknown> | null>(null);
  let pipelineResults = $state<Record<string, unknown> | null>(null);
  let isvResult = $state<Record<string, unknown> | null>(null);
  let calibrationData = $state<Record<string, unknown> | null>(null);

  // Streaming state
  let streaming = $state(false);
  let pipelineSteps = $state<PipelineStepState[]>([]);
  let activeEventSource: EventSource | null = null;

  // Session-storage keys for state persistence across HMR / page reloads.
  // In Vite dev mode, any file edit triggers a full page reload, which loses
  // all Svelte $state. We persist the active project selection and detect
  // interrupted calculations so the user gets a clear message instead of
  // silently resetting to the "Select a Project" screen.
  const STORAGE_SLUG = 'isv-active-slug';
  const STORAGE_CALC = 'isv-pending-calc';

  // Load projects on mount
  onMount(() => {
    (async () => {
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

      // Restore active project from sessionStorage (survives HMR page reloads)
      const storedSlug = sessionStorage.getItem(STORAGE_SLUG);
      if (storedSlug && projects.some(p => p.slug === storedSlug)) {
        activeSlug = storedSlug;
      }

      // Detect interrupted calculation (HMR reload killed a pending SSE stream)
      const pendingCalc = sessionStorage.getItem(STORAGE_CALC);
      if (pendingCalc) {
        sessionStorage.removeItem(STORAGE_CALC);
        error = {
          code: 'CALCULATION_INTERRUPTED',
          message: 'A running ISV calculation was interrupted by a page reload (likely triggered by a file save in your editor). Please re-run the calculation.',
          source: 'web-ui',
        };
      }
    })();

    // Cleanup on unmount
    return () => closeEventSource();
  });

  function closeEventSource() {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
  }

  function selectProject(slug: string) {
    // AC-1.3, AC-1.4: Select project, only one active at a time
    // AC-1.5: Reset panels when switching projects
    closeEventSource();
    activeSlug = slug;
    sessionStorage.setItem(STORAGE_SLUG, slug);
    ticketData = null;
    pipelineResults = null;
    isvResult = null;
    calibrationData = null;
    error = null;
    streaming = false;
    pipelineSteps = [];
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  /** Map a step ID to the index in pipelineSteps for status updates. */
  function updateStepStatus(stepId: string, status: PipelineStepStatus, detail?: string) {
    pipelineSteps = pipelineSteps.map(s => {
      if (s.id === stepId) {
        return { ...s, status, detail: detail ?? s.detail };
      }
      return s;
    });
  }

  /** Mark all steps up to (but not including) the given step as completed. */
  function markPreviousStepsCompleted(stepId: string) {
    const idx = pipelineSteps.findIndex(s => s.id === stepId);
    if (idx <= 0) return;
    pipelineSteps = pipelineSteps.map((s, i) => {
      if (i < idx && s.status !== 'completed') {
        return { ...s, status: 'completed' as PipelineStepStatus };
      }
      return s;
    });
  }

  async function handleCalculate(ticketId: string) {
    if (!activeSlug) return;

    // Close any previous connection
    closeEventSource();

    // Reset all state
    loading = true;
    streaming = true;
    error = null;
    ticketData = null;
    pipelineResults = null;
    isvResult = null;
    calibrationData = null;
    pipelineSteps = createInitialSteps();

    // Mark calculation as pending so reloads can detect the interruption
    sessionStorage.setItem(STORAGE_CALC, new Date().toISOString());

    const url = `/api/calculate/stream?ticketId=${encodeURIComponent(ticketId)}&projectSlug=${encodeURIComponent(activeSlug)}`;
    const es = new EventSource(url);
    activeEventSource = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          step: string;
          completedSteps: number;
          totalSteps: number;
          data?: Record<string, unknown>;
          detail?: string;
        };

        // Mark previous steps completed, current step in-progress
        markPreviousStepsCompleted(data.step);
        updateStepStatus(data.step, 'completed', data.detail);

        // Map step data to existing result state variables
        if (data.step === 'ticket-fetched' && data.data?.ticket) {
          ticketData = data.data.ticket as Record<string, unknown>;
        } else if (data.step === 'code-health-mined' && data.data?.codeHealthReports) {
          // Initialize pipelineResults with code health data
          pipelineResults = {
            ...(pipelineResults ?? {}),
            repositories: data.data.codeHealthReports,
          };
        } else if (data.step === 'architecture-scanned' && data.data) {
          // Append architecture results per repo
          const repos = ((pipelineResults as Record<string, unknown>)?.repositories as unknown[]) ?? [];
          pipelineResults = {
            ...(pipelineResults ?? {}),
            repositories: [...repos, data.data],
          };
        } else if (data.step === 'c2-derived' && data.data) {
          pipelineResults = {
            ...(pipelineResults ?? {}),
            effectiveC2: data.data.effectiveC2,
            repositories: data.data.repositories as unknown[],
          };
        } else if (data.step === 'gap-analyzed' && data.data?.gapAnalysis) {
          pipelineResults = {
            ...(pipelineResults ?? {}),
            gapAnalysis: data.data.gapAnalysis,
          };
        } else if (data.step === 'isv-calculated' && data.data) {
          isvResult = data.data.isvResult as Record<string, unknown> | null;
          calibrationData = data.data.calibration as Record<string, unknown> | null;
        }
      } catch (e) {
        console.warn('[isv-web] Failed to parse SSE message:', e);
      }
    };

    es.addEventListener('done', (event) => {
      try {
        const result = JSON.parse((event as MessageEvent).data);
        if (result.success && result.data) {
          const data = result.data;
          ticketData = data.ticket ?? ticketData;
          pipelineResults = data.pipelineResults ?? pipelineResults;
          isvResult = data.isvResult ?? isvResult;
          calibrationData = data.calibration ?? calibrationData;
        }
      } catch (e) {
        console.warn('[isv-web] Failed to parse done event:', e);
      }
      // Mark all steps completed
      pipelineSteps = pipelineSteps.map(s => ({
        ...s,
        status: s.status === 'error' ? 'error' : 'completed' as PipelineStepStatus,
      }));
      sessionStorage.removeItem(STORAGE_CALC);
      loading = false;
      streaming = false;
      closeEventSource();
    });

    es.addEventListener('error', (event) => {
      // Check if this is a named 'error' SSE event (with data) or a connection error
      if (event instanceof MessageEvent && event.data) {
        try {
          const errData = JSON.parse(event.data);
          error = {
            code: errData.code ?? 'PIPELINE_ERROR',
            message: errData.message ?? 'Pipeline error',
            source: errData.source ?? 'web-api',
          };
        } catch {
          error = { code: 'PIPELINE_ERROR', message: 'Unknown pipeline error', source: 'web-api' };
        }
        // Mark remaining pending steps as skipped
        pipelineSteps = pipelineSteps.map(s => ({
          ...s,
          status: s.status === 'pending' || s.status === 'in-progress' ? 'skipped' as PipelineStepStatus : s.status,
        }));
        sessionStorage.removeItem(STORAGE_CALC);
        loading = false;
        streaming = false;
        closeEventSource();
      }
    });

    // Connection error (not the named 'error' SSE event)
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        // Stream was closed normally — done event handler already ran
        return;
      }
      // Connection drop
      error = {
        code: 'CONNECTION_ERROR',
        message: 'SSE connection lost. You can retry the calculation.',
        source: 'web-ui',
      };
      pipelineSteps = pipelineSteps.map(s => ({
        ...s,
        status: s.status === 'pending' || s.status === 'in-progress' ? 'skipped' as PipelineStepStatus : s.status,
      }));
      sessionStorage.removeItem(STORAGE_CALC);
      loading = false;
      streaming = false;
      closeEventSource();
    };
  }
</script>

<!-- Panel 1: Sidebar (AC-UI-1) -->
<Sidebar {projects} {activeSlug} onselect={selectProject} collapsed={sidebarCollapsed} ontoggle={toggleSidebar} />

<!-- Panel 2: Center — ISV Calculator -->
<!-- AC-UI-1.8: Panels expand naturally via flex-1 when sidebar collapses -->
<main class="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
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
    <!-- AC-UI-2.4: Bottom padding when sticky bar is present so last content item is reachable -->
    <div class="flex-1 space-y-4 p-6" class:pb-24={isvResult && !loading && !error}>
      <!-- Pipeline progress tracker — shown while streaming -->
      <PipelineProgress steps={pipelineSteps} visible={loading && streaming} />

      {#if loading && !streaming}
        <!-- Fallback skeleton loading (non-streaming path) -->
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
      {/if}

      {#if error}
        <!-- AC-2.5: Error display -->
        <ErrorDisplay code={error.code} message={error.message} source={error.source} />
      {/if}

      <!-- Incremental result cards — fade in as data arrives -->
      {#if ticketData}
        <div class="animate-fade-in">
          <TicketInfo ticket={ticketData as any} />
        </div>
      {:else if loading}
        <Card title="Ticket Information">
          <Skeleton lines={4} />
        </Card>
      {/if}

      {#if pipelineResults}
        <div class="animate-fade-in">
          <PipelineResults pipelineResults={pipelineResults as any} />
        </div>
      {:else if loading}
        <Card title="Pipeline Results">
          <Skeleton lines={5} />
        </Card>
      {/if}

      {#if isvResult}
        <div class="animate-fade-in">
          <!-- AC-UI-2.7: Full-detail IsvResult card retained in scrollable area -->
          <IsvResult result={isvResult as any} />
        </div>
      {:else if loading}
        <Card title="ISV Result">
          <Skeleton lines={3} />
        </Card>
      {/if}

      {#if !loading && !error && !isvResult && !ticketData}
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

    <!-- AC-UI-2.1/AC-UI-2.5: Sticky ISV result bar, only when result is available -->
    {#if isvResult && !loading && !error}
      <StickyIsvResult result={isvResult as any} />
    {/if}
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

<style>
  .animate-fade-in {
    animation: fadeIn 300ms ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
