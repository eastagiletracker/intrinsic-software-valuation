<!--
  Pipeline Progress — step tracker showing step-by-step calculation progress.

  Displays 8 pipeline steps with per-step visual states (pending, in-progress,
  completed, error, skipped). LLM-assisted steps show an AI label when active.
  Auto-collapses after all steps complete with a toggle to re-expand.
-->
<script lang="ts">
  import ElapsedTimer from './ElapsedTimer.svelte';

  export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'error' | 'skipped';

  export interface PipelineStep {
    id: string;
    label: string;
    status: StepStatus;
    aiAssisted?: boolean;
    detail?: string;
  }

  let {
    steps = [],
    visible = true,
  }: {
    steps?: PipelineStep[];
    visible?: boolean;
  } = $props();

  let allCompleted = $derived(steps.length > 0 && steps.every(s => s.status === 'completed'));
  let collapsed = $state(false);
  let timerRunning = $derived(visible && steps.some(s => s.status === 'in-progress'));

  // Auto-collapse when all steps complete
  $effect(() => {
    if (allCompleted) {
      collapsed = true;
    }
  });

  function toggle() {
    collapsed = !collapsed;
  }

  let currentStepNumber = $derived(
    steps.filter(s => s.status === 'completed' || s.status === 'in-progress').length
  );
</script>

{#if visible}
  <div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
    <!-- Header row -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <ElapsedTimer running={timerRunning} />
        <span class="text-sm text-text-secondary">
          ISV calculations typically take 3–6 min.
        </span>
      </div>
      <button
        type="button"
        class="text-xs text-text-highlight hover:underline"
        onclick={toggle}
      >
        {collapsed ? 'Show steps' : 'Hide steps'}
      </button>
    </div>

    <!-- Step list -->
    {#if !collapsed}
      <ol class="mt-4 space-y-2">
        {#each steps as step, i}
          <li class="flex items-center gap-2 text-sm" class:opacity-40={step.status === 'pending' || step.status === 'skipped'}>
            <!-- Icon -->
            {#if step.status === 'completed'}
              <svg class="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            {:else if step.status === 'in-progress'}
              <svg class="h-4 w-4 shrink-0 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            {:else if step.status === 'error'}
              <svg class="h-4 w-4 shrink-0 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            {:else if step.status === 'skipped'}
              <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary">—</span>
            {:else}
              <!-- pending -->
              <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                <span class="h-2 w-2 rounded-full bg-border"></span>
              </span>
            {/if}

            <!-- Label -->
            <span class:text-accent-red={step.status === 'error'} class:font-medium={step.status === 'in-progress'}>
              {step.label}
            </span>

            <!-- Detail (e.g. "repo 2 of 3") -->
            {#if step.detail && (step.status === 'in-progress' || step.status === 'completed')}
              <span class="text-xs text-text-secondary">({step.detail})</span>
            {/if}

            <!-- Step counter for active step -->
            {#if step.status === 'in-progress'}
              <span class="ml-auto text-xs text-text-secondary">
                Step {currentStepNumber} of {steps.length}
              </span>
            {/if}

            <!-- AI label for LLM-assisted steps -->
            {#if step.aiAssisted && step.status === 'in-progress'}
              <span class="rounded-full bg-surface-blue px-2 py-0.5 text-xs text-brand">
                AI-assisted — may take 1–2 min
              </span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}
