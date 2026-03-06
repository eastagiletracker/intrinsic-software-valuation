<!--
  Slide-in detail panel for a selected Ship Unit Cluster.

  Shows:
  1. Cluster metadata (ticket IDs, type, story points, timestamp)
  2. ISV analysis (score, confidence, factor breakdown)
  3. Regression residual (predicted vs actual, outlier status)
  4. Hours summary
  5. Git change metrics (LOC, files, entropy, complexity, intensity)
  6. Cached deep-dive artifacts (Gap Analyzer, Architecture Scanner, Status Quo Miner)
-->
<script lang="ts">
  import { featureLabel } from "$lib/components/feature-labels.js";

  type Factors = {
    A1_Data: number;
    A2_UX: number;
    B1_Logic: number;
    C1_Integration: number;
    C2_State: number;
    D3_Quality: number;
  };

  type Cluster = {
    clusterId: string;
    ids: string[];
    metadata: {
      type: string;
      storyPoints?: number;
      timestampT0: string;
    };
    isvAnalysis: {
      formulaVersion: string;
      isvScore: number;
      confidence: number;
      factors: Factors;
      breakdown: {
        poValue: number;
        archFactor: number;
        qualityMultiplier: number;
      };
    };
    metrics: {
      totalHours: number;
      gitChanges: {
        locAdded: number;
        locDeleted: number;
        filesChanged: number;
        distributionEntropy: number;
        cyclomaticComplexityDelta: number;
        changeIntensityScore: number;
      };
    };
  };

  type Residual = {
    clusterId: string;
    actualHours: number;
    predictedHours: number;
    residual: number;
    standardizedResidual: number;
    isOutlier: boolean;
  };

  type CachedSnapshotEntry = {
    repositoryId: string;
    cacheFile: string;
    createdAt: string;
    observedAt?: string;
    data: unknown;
  };

  type ClusterCacheDetails = {
    clusterId: string;
    clusterIds: string[];
    gapAnalysis: {
      ticketId: string;
      cacheFile: string;
      createdAt: string;
      data: unknown;
    } | null;
    architectureScanner: {
      entries: CachedSnapshotEntry[];
    };
    statusQuoMiner: {
      entries: CachedSnapshotEntry[];
    };
  };

  let {
    cluster,
    residual,
    cacheDetails = null,
    cacheLoading = false,
    cacheError = null,
    hourlyRate,
    onclose,
  }: {
    cluster: Cluster;
    residual: Residual | undefined;
    cacheDetails?: ClusterCacheDetails | null;
    cacheLoading?: boolean;
    cacheError?: string | null;
    hourlyRate: number;
    onclose: () => void;
  } = $props();

  const factors = $derived(cluster.isvAnalysis.factors);
  const git = $derived(cluster.metrics.gitChanges);
  const euroValue = $derived(cluster.isvAnalysis.isvScore * hourlyRate);

  function fmt(n: number, d = 1): string {
    return n.toFixed(d);
  }

  function fmtInt(n: number): string {
    return n.toLocaleString("de-DE");
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  /** Handle Escape key to close panel. */
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  function toPrettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
  onclick={onclose}
></div>

<!-- Panel -->
<aside
  class="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden border-l border-border bg-surface shadow-xl"
  role="dialog"
  aria-label="Cluster detail: {cluster.clusterId}"
>
  <!-- Header -->
  <header class="flex items-center justify-between border-b border-border px-5 py-4">
    <div>
      <h2 class="text-base font-semibold text-text">{cluster.clusterId}</h2>
      <p class="text-xs text-text-secondary">
        {cluster.metadata.type}
        {#if cluster.metadata.storyPoints != null}
          · {cluster.metadata.storyPoints} SP
        {/if}
      </p>
    </div>
    <button
      class="rounded p-1.5 text-text-secondary hover:bg-surface-secondary hover:text-text"
      onclick={onclose}
      aria-label="Close"
    >
      <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </header>

  <!-- Scrollable content -->
  <div class="flex-1 overflow-y-auto p-5 space-y-5">
    <!-- ============================================================ -->
    <!-- Section 1: Ship Unit Cluster                                 -->
    <!-- ============================================================ -->
    <section>
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Ship Unit Cluster</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-text-secondary">Ticket IDs</span>
          <span class="font-mono text-right">{cluster.ids.join(", ")}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">Type</span>
          <span>{cluster.metadata.type}</span>
        </div>
        {#if cluster.metadata.storyPoints != null}
          <div class="flex justify-between">
            <span class="text-text-secondary">Story Points</span>
            <span class="tabular-nums">{cluster.metadata.storyPoints}</span>
          </div>
        {/if}
        <div class="flex justify-between">
          <span class="text-text-secondary">Baseline (T₀)</span>
          <span>{fmtDate(cluster.metadata.timestampT0)}</span>
        </div>
      </div>
    </section>

    <hr class="border-border-light" />

    <!-- ============================================================ -->
    <!-- Section 2: ISV Analysis                                      -->
    <!-- ============================================================ -->
    <section>
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">ISV Analysis</h3>

      <!-- Score headline -->
      <div class="mb-4 flex items-baseline gap-3">
        <span class="text-2xl font-bold text-brand">{fmt(cluster.isvAnalysis.isvScore, 1)}</span>
        <span class="text-sm text-text-secondary">ISV Score</span>
        <span class="ml-auto text-sm tabular-nums text-text-secondary">
          ≈ {euroValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
        </span>
      </div>

      <!-- Confidence + formula -->
      <div class="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-xs text-text-secondary">Confidence</span>
          <p class="font-semibold tabular-nums">{fmt(cluster.isvAnalysis.confidence, 2)}</p>
        </div>
        <div>
          <span class="text-xs text-text-secondary">Formula</span>
          <p class="font-semibold">v{cluster.isvAnalysis.formulaVersion}</p>
        </div>
      </div>

      <!-- Factors -->
      <h4 class="mb-2 text-xs font-medium text-text-secondary">Gap Analysis Factors</h4>
      <div class="grid grid-cols-3 gap-2">
        {#each Object.entries(factors) as [key, val]}
          <div class="rounded-lg bg-surface-secondary px-3 py-2 text-center">
            <span class="block text-[10px] text-text-secondary">{featureLabel(key)}</span>
            <span class="block text-base font-bold tabular-nums text-text">{val}</span>
          </div>
        {/each}
      </div>

      <!-- Breakdown -->
      <h4 class="mb-2 mt-4 text-xs font-medium text-text-secondary">Formula Breakdown</h4>
      <div class="grid grid-cols-3 gap-2 text-sm">
        <div class="rounded-lg bg-surface-secondary px-3 py-2 text-center">
          <span class="block text-[10px] text-text-secondary">PO Value</span>
          <span class="block font-semibold tabular-nums">{cluster.isvAnalysis.breakdown.poValue}</span>
        </div>
        <div class="rounded-lg bg-surface-secondary px-3 py-2 text-center">
          <span class="block text-[10px] text-text-secondary">Arch Factor</span>
          <span class="block font-semibold tabular-nums">{cluster.isvAnalysis.breakdown.archFactor}</span>
        </div>
        <div class="rounded-lg bg-surface-secondary px-3 py-2 text-center">
          <span class="block text-[10px] text-text-secondary">Quality ×</span>
          <span class="block font-semibold tabular-nums">{cluster.isvAnalysis.breakdown.qualityMultiplier}</span>
        </div>
      </div>
    </section>

    <hr class="border-border-light" />

    <!-- ============================================================ -->
    <!-- Section 3: Regression / Residual                             -->
    <!-- ============================================================ -->
    {#if residual}
      <section>
        <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Regression Residual</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-text-secondary">Actual Hours</span>
            <span class="font-semibold tabular-nums">{fmt(residual.actualHours)}h</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">Predicted Hours</span>
            <span class="tabular-nums">{fmt(residual.predictedHours)}h</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">Residual</span>
            <span class="tabular-nums {residual.residual > 0 ? 'text-accent-red' : 'text-green-600'}">
              {residual.residual > 0 ? "+" : ""}{fmt(residual.residual)}h
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">Std. Residual</span>
            <span class="tabular-nums">{fmt(residual.standardizedResidual, 2)}</span>
          </div>
          {#if residual.isOutlier}
            <div class="mt-1 rounded bg-accent-red-extra-light px-3 py-1.5 text-xs font-semibold text-accent-red">
              Flagged as outlier (|std. residual| &gt; 2)
            </div>
          {/if}
        </div>
      </section>

      <hr class="border-border-light" />
    {/if}

    <!-- ============================================================ -->
    <!-- Section 4: Hours Summary                                     -->
    <!-- ============================================================ -->
    <section>
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Hours Summary</h3>
      <div class="flex items-baseline gap-3">
        <span class="text-2xl font-bold text-text">{fmt(cluster.metrics.totalHours)}h</span>
        <span class="text-sm text-text-secondary">total tracked</span>
      </div>
    </section>

    <hr class="border-border-light" />

    <!-- ============================================================ -->
    <!-- Section 5: Git Change Metrics                                -->
    <!-- ============================================================ -->
    <section>
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Git Change Metrics</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-text-secondary">LOC Added</span>
          <span class="tabular-nums text-green-600">+{fmtInt(git.locAdded)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">LOC Deleted</span>
          <span class="tabular-nums text-accent-red">−{fmtInt(git.locDeleted)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">Files Changed</span>
          <span class="tabular-nums">{fmtInt(git.filesChanged)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">{featureLabel("distributionEntropy")}</span>
          <span class="tabular-nums">{fmt(git.distributionEntropy, 2)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">{featureLabel("cyclomaticComplexityDelta")}</span>
          <span class="tabular-nums">{fmt(git.cyclomaticComplexityDelta, 0)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-secondary">{featureLabel("changeIntensityScore")}</span>
          <span class="tabular-nums">{fmt(git.changeIntensityScore, 3)}</span>
        </div>
      </div>
    </section>

    <hr class="border-border-light" />

    <!-- ============================================================ -->
    <!-- Section 6: Cached Deep Dive                                  -->
    <!-- ============================================================ -->
    <section>
      <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Other Reports (Cache)</h3>

      {#if cacheLoading}
        <p class="text-sm text-text-secondary">Loading cached artifacts...</p>
      {:else if cacheError}
        <div class="rounded bg-accent-red-extra-light px-3 py-2 text-xs text-accent-red">
          {cacheError}
        </div>
      {:else if cacheDetails}
        <div class="space-y-3">
          <div class="rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
            <h4 class="text-xs font-semibold text-text">Gap Analyzer</h4>
            {#if cacheDetails.gapAnalysis}
              <p class="mt-1 text-xs text-text-secondary font-mono">
                {cacheDetails.gapAnalysis.cacheFile} · {fmtDate(cacheDetails.gapAnalysis.createdAt)}
              </p>
              <details class="mt-2">
                <summary class="cursor-pointer text-xs text-brand">Show raw JSON</summary>
                <pre class="mt-2 max-h-72 overflow-auto rounded bg-brand-dark p-2 text-[11px] text-text-inverse">{toPrettyJson(cacheDetails.gapAnalysis.data)}</pre>
              </details>
            {:else}
              <p class="mt-1 text-xs text-text-secondary">No matching gap-analyzer cache entry found for this cluster.</p>
            {/if}
          </div>

          <div class="rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
            <h4 class="text-xs font-semibold text-text">Architecture Scanner</h4>
            {#if cacheDetails.architectureScanner.entries.length > 0}
              {#each cacheDetails.architectureScanner.entries as entry}
                <div class="mt-2 rounded border border-border bg-surface p-2">
                  <p class="text-xs font-mono text-text-secondary">
                    {entry.repositoryId} · {entry.cacheFile} · {fmtDate(entry.createdAt)}
                  </p>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-xs text-brand">Show raw JSON</summary>
                    <pre class="mt-2 max-h-72 overflow-auto rounded bg-brand-dark p-2 text-[11px] text-text-inverse">{toPrettyJson(entry.data)}</pre>
                  </details>
                </div>
              {/each}
            {:else}
              <p class="mt-1 text-xs text-text-secondary">No architecture-scanner cache entries found.</p>
            {/if}
          </div>

          <div class="rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
            <h4 class="text-xs font-semibold text-text">Status Quo Miner</h4>
            {#if cacheDetails.statusQuoMiner.entries.length > 0}
              {#each cacheDetails.statusQuoMiner.entries as entry}
                <div class="mt-2 rounded border border-border bg-surface p-2">
                  <p class="text-xs font-mono text-text-secondary">
                    {entry.repositoryId} · {entry.cacheFile} · {fmtDate(entry.createdAt)}
                    {#if entry.observedAt}
                      · observed {fmtDate(entry.observedAt)}
                    {/if}
                  </p>
                  <details class="mt-1">
                    <summary class="cursor-pointer text-xs text-brand">Show raw JSON</summary>
                    <pre class="mt-2 max-h-72 overflow-auto rounded bg-brand-dark p-2 text-[11px] text-text-inverse">{toPrettyJson(entry.data)}</pre>
                  </details>
                </div>
              {/each}
            {:else}
              <p class="mt-1 text-xs text-text-secondary">No status-quo-miner cache entries found.</p>
            {/if}
          </div>
        </div>
      {:else}
        <p class="text-xs text-text-secondary">Select a cluster point to load cache-backed details.</p>
      {/if}
    </section>
  </div>
</aside>
