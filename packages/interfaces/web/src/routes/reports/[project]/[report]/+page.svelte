<script lang="ts">
  import type { PageData } from "./$types.js";
  import type { CohortKey, CohortCalibration } from "@isv/domain";
  import Card from "$lib/components/Card.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import ClusterScatterChart from "$lib/components/ClusterScatterChart.svelte";
  import ResidualChart from "$lib/components/ResidualChart.svelte";
  import ClusterDetailPanel from "$lib/components/ClusterDetailPanel.svelte";
  import { featureLabel } from "$lib/components/feature-labels.js";

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

  let { data }: { data: PageData } = $props();

  let showExplanations = $state(false);

  const clusters = $derived(data.report.clusters);
  const skipped = $derived(data.report.skippedClusters);

  // --- Cohort tier selection ---
  const cohortCalibrations = $derived(data.report.cohortCalibrations ?? []);
  const cohortOverview = $derived(data.report.cohortOverview ?? []);
  const hasCohorts = $derived(cohortCalibrations.length > 0);

  /** Currently selected cohort combination key. Defaults to primaryCohortKey. */
  let selectedCohortKey = $state<CohortKey | null>(null);
  const activeCohortKey = $derived(
    selectedCohortKey ?? data.report.primaryCohortKey ?? null,
  );

  /** The active cohort calibration (null = use top-level result). */
  const activeCohort: CohortCalibration | undefined = $derived(
    activeCohortKey
      ? cohortCalibrations.find((cc) => cc.key === activeCohortKey)
      : undefined,
  );

  /** Active result — from the selected cohort or top-level. */
  const r = $derived(activeCohort?.calibration ?? data.report.result);
  /** Active residuals — from the selected cohort or top-level. */
  const residuals = $derived(activeCohort?.residuals ?? data.report.residuals);

  /** Legacy daily rate in € for an 8-hour day (from project config). */
  const dailyRate = $derived(data.legacyDailyRate);
  const hourlyRate = $derived(dailyRate / 8);

  /** True when all clusters have zero tracked hours — data is degenerate. */
  const allHoursZero = $derived(
    clusters.length > 0 && clusters.every((c) => c.metrics.totalHours === 0),
  );

  /** Convert Ship Rate (h/ISV) → € per ISV using the project daily rate. */
  const euroPerIsv = $derived(r.shipRateHoursPerIsv * hourlyRate);
  const euroPerIsvExclOutliers = $derived(r.shipRateExclOutliers * hourlyRate);

  /** Selected cluster for detail panel. */
  let selectedClusterId = $state<string | null>(null);
  let clusterCacheDetails = $state<ClusterCacheDetails | null>(null);
  let clusterCacheLoading = $state(false);
  let clusterCacheError = $state<string | null>(null);

  const selectedCluster = $derived(
    selectedClusterId
      ? clusters.find((c) => c.clusterId === selectedClusterId) ?? null
      : null,
  );

  const selectedResidual = $derived(
    selectedClusterId
      ? residuals.find((r) => r.clusterId === selectedClusterId)
      : undefined,
  );

  async function loadClusterCacheDetails(clusterId: string): Promise<void> {
    clusterCacheLoading = true;
    clusterCacheError = null;

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(data.projectSlug)}/reports?reportSlug=${encodeURIComponent(data.reportSlug)}&clusterId=${encodeURIComponent(clusterId)}`,
      );

      if (!response.ok) {
        clusterCacheDetails = null;
        clusterCacheError = `Unable to load cache details (${response.status})`;
        return;
      }

      const payload = (await response.json()) as {
        success?: boolean;
        data?: ClusterCacheDetails;
      };

      if (payload.success && payload.data) {
        clusterCacheDetails = payload.data;
      } else {
        clusterCacheDetails = null;
        clusterCacheError = "Cache details response was invalid.";
      }
    } catch (err) {
      clusterCacheDetails = null;
      clusterCacheError = err instanceof Error ? err.message : String(err);
    } finally {
      clusterCacheLoading = false;
    }
  }

  function handleClusterClick(clusterId: string) {
    if (selectedClusterId === clusterId) {
      selectedClusterId = null;
      clusterCacheDetails = null;
      clusterCacheError = null;
      clusterCacheLoading = false;
      return;
    }

    selectedClusterId = clusterId;
    void loadClusterCacheDetails(clusterId);
  }

  function fitBadgeClass(fit: string): string {
    switch (fit) {
      case "strong":
        return "bg-green-100 text-green-800";
      case "moderate":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-red-100 text-red-800";
    }
  }

  function flagBadgeClass(flag: string): string {
    switch (flag) {
      case "pass":
        return "bg-green-100 text-green-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-red-100 text-red-800";
    }
  }

  function formatNumber(n: number, decimals = 3): string {
    return n.toFixed(decimals);
  }

  /** Format a number as Euro with locale grouping (e.g. 525.00 €). */
  function formatEuro(n: number, decimals = 2): string {
    return n.toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + " €";
  }

  /** Set of cluster IDs in the active cohort (for filtering charts). */
  const activeClusterIds = $derived(
    activeCohort
      ? new Set(activeCohort.residuals.map((r) => r.clusterId))
      : null,
  );

  /** Clusters visible in charts (filtered by cohort or all). */
  const visibleClusters = $derived(
    activeClusterIds
      ? clusters.filter((c) => activeClusterIds.has(c.clusterId))
      : clusters,
  );

  // Scatter chart data: ISV score vs actual tracked hours (enriched with ticket IDs)
  const scatterData = $derived(
    visibleClusters.map((c) => ({
      x: c.isvAnalysis.isvScore,
      y: c.metrics.totalHours,
      label: c.clusterId,
      ids: c.ids,
    })),
  );

  // Residual chart data (enriched with ticket IDs)
  const residualData = $derived(
    residuals.map((res) => {
      const cluster = visibleClusters.find((c) => c.clusterId === res.clusterId);
      return {
        x: res.predictedHours,
        y: res.residual,
        label: res.clusterId,
        ids: cluster?.ids ?? [res.clusterId],
        isOutlier: res.isOutlier,
      };
    }),
  );
</script>

<svelte:head>
  <title>Report {data.reportSlug} — {data.projectSlug}</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
  <!-- Header -->
  <header class="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
    <div>
      <a
        href="/reports/{data.projectSlug}"
        class="text-xs text-text-secondary hover:text-brand"
      >
        ← All Reports
      </a>
      <h1 class="mt-1 text-lg font-semibold text-text">
        Calibration Report
      </h1>
      <p class="text-sm text-text-secondary">
        {data.projectSlug} · {r.periodStart} → {r.periodEnd}
      </p>
    </div>
    <label class="flex items-center gap-2 text-xs text-text-secondary">
      <input
        type="checkbox"
        bind:checked={showExplanations}
        class="accent-brand"
      />
      Show explanations
    </label>
  </header>

  <!-- Report content -->
  <main class="flex-1 overflow-y-auto p-6 space-y-6">
    <!-- ================================================================== -->
    <!-- Daily Rate Reference (shown at top of report)                      -->
    <!-- ================================================================== -->
    <div class="flex items-center gap-6 rounded-xl border border-border bg-surface-blue px-5 py-3 text-sm">
      <span class="font-semibold text-text">
        <Tooltip term="Legacy Daily Rate" {showExplanations} />
      </span>
      <span class="tabular-nums text-text">{formatEuro(dailyRate, 2)} / day</span>
      <span class="text-text-secondary">=</span>
      <span class="tabular-nums text-text">{formatEuro(hourlyRate, 2)} / h</span>
      <span class="ml-auto text-xs text-text-secondary">(8 h working day)</span>
    </div>

    <!-- ================================================================== -->
    <!-- Warning: Zero tracked hours                                        -->
    <!-- ================================================================== -->
    {#if allHoursZero}
      <div class="rounded-xl border border-accent-red bg-accent-red-extra-light p-4">
        <p class="text-sm font-semibold text-accent-red">⚠ No tracked hours available</p>
        <p class="mt-1 text-xs text-accent-red">
          All {clusters.length} clusters have 0 tracked hours. Time tracking data appears to be
          missing or not yet attributed for this period. Statistical metrics (R², correlations,
          outlier detection, reliability) are not meaningful without actual effort data.
        </p>
      </div>
    {/if}

    <!-- ================================================================== -->
    <!-- Cohort Overview & Tier Selector                                    -->
    <!-- ================================================================== -->
    {#if hasCohorts}
      <Card title="Data Cohorts">
        <p class="mb-3 text-xs text-text-secondary">
          Clusters are partitioned by data confidence. Higher-confidence cohorts
          produce more reliable calibration results. Select a tier to filter the
          report.
        </p>

        <!-- Compact overview table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-text-secondary">
                <th class="pb-2 pr-4">Cohort</th>
                <th class="pb-2 pr-4 text-right">Clusters</th>
                <th class="pb-2 pr-4 text-right">%</th>
                <th class="pb-2 pr-4 text-right">Hours</th>
                <th class="pb-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {#each cohortOverview as entry}
                <tr class="border-b border-border-light">
                  <td class="py-1.5 pr-4 font-medium">
                    <span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-full {
                      entry.cohort === 'A' ? 'bg-green-500' :
                      entry.cohort === 'B' ? 'bg-yellow-500' :
                      'bg-red-400'
                    }"></span>
                    {entry.label}
                  </td>
                  <td class="py-1.5 pr-4 text-right tabular-nums">{entry.clusterCount}</td>
                  <td class="py-1.5 pr-4 text-right tabular-nums text-text-secondary">{entry.clusterPct.toFixed(1)}%</td>
                  <td class="py-1.5 pr-4 text-right tabular-nums">{entry.totalHours.toFixed(0)}</td>
                  <td class="py-1.5 text-right tabular-nums text-text-secondary">{entry.hoursPct.toFixed(1)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Tier selector -->
        <div class="mt-4 flex items-center gap-2">
          <span class="text-xs font-medium text-text-secondary">Calibration tier:</span>
          {#each cohortCalibrations as cc}
            <button
              class="rounded-full px-3 py-1 text-xs font-medium transition-colors {
                activeCohortKey === cc.key
                  ? 'bg-brand text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
              }"
              onclick={() => { selectedCohortKey = cc.key; }}
            >
              {cc.key} ({cc.sampleSize})
            </button>
          {/each}
        </div>

        {#if activeCohortKey && activeCohortKey !== "A+B+C"}
          <p class="mt-2 text-xs text-text-secondary">
            Showing calibration for <strong>{activeCohortKey}</strong> cohort
            ({activeCohort?.sampleSize ?? 0} clusters).
            Lower-confidence clusters are excluded from regression and charts.
          </p>
        {/if}
      </Card>
    {/if}

    <!-- ================================================================== -->
    <!-- Section 1: Executive Summary                                       -->
    <!-- ================================================================== -->
    <Card title="Executive Summary">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Ship Rate" {showExplanations} />
          </p>
          <p class="text-xl font-bold text-brand">
            {formatEuro(euroPerIsv)} <span class="text-xs font-normal text-text-secondary">/ ISV</span>
          </p>
          <p class="mt-0.5 text-xs text-text-secondary tabular-nums">
            {formatNumber(r.shipRateHoursPerIsv, 2)} h / ISV
          </p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="R²" {showExplanations} />
          </p>
          <p class="text-xl font-bold text-text">{formatNumber(r.rSquared)}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Data Quality Score" {showExplanations} />
          </p>
          <p class="text-xl font-bold text-text">{(r.dataQualityScore * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Sample Size" {showExplanations} />
          </p>
          <p class="text-xl font-bold text-text">{r.sampleSize}</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Ship Rate" {showExplanations} /> (excl. outliers)
          </p>
          <p class="text-lg font-semibold text-text">{formatEuro(euroPerIsvExclOutliers)} / ISV</p>
          <p class="mt-0.5 text-xs text-text-secondary tabular-nums">
            {formatNumber(r.shipRateExclOutliers, 2)} h / ISV
          </p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Adjusted R²" {showExplanations} />
          </p>
          <p class="text-lg font-semibold text-text">{formatNumber(r.adjustedRSquared)}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">Formula Version</p>
          <p class="text-lg font-semibold text-text">{r.formulaVersion}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Fit Assessment" {showExplanations} />
          </p>
          <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium {fitBadgeClass(r.formulaValidation.fitAssessment)}">
            {r.formulaValidation.fitAssessment}
          </span>
        </div>
      </div>

      {#if data.report.executiveSummary}
        <div class="mt-5 rounded-lg border border-border bg-surface-secondary p-4">
          <p class="mb-2 text-xs font-semibold text-text-secondary uppercase tracking-wide">AI-Generated Summary</p>
          <p class="text-sm leading-relaxed text-text whitespace-pre-line">{data.report.executiveSummary}</p>
        </div>
      {/if}
    </Card>

    <!-- ================================================================== -->
    <!-- Section 2: Cluster Scatter Plot (AC-5: avoid prediction semantics) -->
    <!-- ================================================================== -->
    <Card title="ISV-Derived Comparison Value vs. Actual Tracked Hours">
      <p class="mb-4 text-xs text-text-secondary">
        Each point represents a <Tooltip term="Ship Unit Cluster" {showExplanations} />.
        The x-axis shows the <Tooltip term="ISV Score" {showExplanations} /> and
        the y-axis shows actual tracked hours.
      </p>
      <div class="h-80">
        <ClusterScatterChart
          data={scatterData}
          selectedLabel={selectedClusterId}
          onpointclick={handleClusterClick}
        />
      </div>
    </Card>

    <!-- ================================================================== -->
    <!-- Section 3: Residual / Distribution Transparency                    -->
    <!-- ================================================================== -->
    <Card title="Residual Distribution">
      <p class="mb-4 text-xs text-text-secondary">
        <Tooltip term="Residual" {showExplanations} /> for each cluster.
        Points beyond ±2 <Tooltip term="Standardised Residual" {showExplanations} /> are flagged as outliers.
      </p>
      <div class="h-80">
        <ResidualChart
          data={residualData}
          selectedLabel={selectedClusterId}
          onpointclick={handleClusterClick}
        />
      </div>
    </Card>

    <!-- ================================================================== -->
    <!-- Section 4: Factor Diagnostics                                      -->
    <!-- ================================================================== -->
    <Card title="Factor Diagnostics">
      <p class="mb-4 text-xs text-text-secondary">
        Per-factor regression statistics showing
        <Tooltip term="Partial Correlation" {showExplanations} />,
        <Tooltip term="Weight (β)" {showExplanations} />, and
        <Tooltip term="p-Value" {showExplanations} />.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border text-left text-xs text-text-secondary">
              <th class="pb-2 pr-4">Feature</th>
              <th class="pb-2 pr-4 text-right">Partial Corr.</th>
              <th class="pb-2 pr-4 text-right">Weight (β)</th>
              <th class="pb-2 pr-4 text-right">p-Value</th>
              <th class="pb-2">Significant</th>
            </tr>
          </thead>
          <tbody>
            {#each r.factorDiagnostics as diag}
              <tr class="border-b border-border-light">
                <td class="py-2 pr-4 font-medium">{featureLabel(diag.feature)}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(diag.partialCorrelation)}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(diag.weight)}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(diag.pValue, 4)}</td>
                <td class="py-2">
                  {#if diag.pValue < 0.05}
                    <span class="text-green-600">✓</span>
                  {:else}
                    <span class="text-text-secondary">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if r.formulaValidation.mismatches.gitMetricsOutperformingIsv}
        <p class="mt-3 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
          ⚠ Git metrics outperform ISV factors in explanatory power. Consider reviewing formula weights.
        </p>
      {/if}
    </Card>

    <!-- ================================================================== -->
    <!-- Section 5: Outliers                                                -->
    <!-- ================================================================== -->
    <Card title="Outlier Report">
      <div class="mb-4 flex gap-6 text-sm">
        <span>
          <Tooltip term="Outlier" {showExplanations} /> count:
          <strong>{r.outliers.outlierCount}</strong>
        </span>
        <span>
          Percentage:
          <strong>{(r.outliers.outlierPercentage * 100).toFixed(1)}%</strong>
        </span>
      </div>

      {#if r.outliers.entries.length > 0}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-text-secondary">
                <th class="pb-2 pr-4">Cluster ID</th>
                <th class="pb-2 pr-4 text-right">Residual</th>
                <th class="pb-2 pr-4 text-right">Std. Residual</th>
                <th class="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {#each r.outliers.entries as entry}
                <tr class="border-b border-border-light">
                  <td class="py-2 pr-4 font-mono text-xs">{entry.clusterId}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(entry.residual, 1)}</td>
                  <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(entry.standardizedResidual, 2)}</td>
                  <td class="py-2">
                    <span class="rounded bg-accent-red-extra-light px-1.5 py-0.5 text-xs text-accent-red">
                      {entry.reason}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="text-sm text-text-secondary">No outliers detected.</p>
        {#if allHoursZero}
          <p class="mt-2 rounded bg-yellow-50 p-2 text-xs text-yellow-800">
            Outlier detection requires non-zero tracked hours. With all hours at zero, residual variance is near zero so no standardized residual exceeds the ±2σ threshold — visual outliers in the scatter chart cannot be flagged statistically.
          </p>
        {/if}
      {/if}
    </Card>

    <!-- ================================================================== -->
    <!-- Section 6: Data Quality & Reliability                              -->
    <!-- ================================================================== -->
    <Card title="Data Quality & Reliability">
      {#if allHoursZero}
        <div class="mb-4 rounded bg-yellow-50 p-3 text-xs text-yellow-800">
          Reliability metrics require non-zero tracked hours. Values below are not meaningful for this calibration run.
        </div>
      {/if}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="DQS" {showExplanations} />
          </p>
          <p class="text-lg font-semibold">{(r.reliability.dataQualityScore * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">Effective Sample Size</p>
          <p class="text-lg font-semibold">{r.reliability.effectiveSampleSize}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">Standard Error</p>
          <p class="text-lg font-semibold">{formatNumber(r.reliability.standardError, 2)}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Confidence Interval (95%)" {showExplanations} />
          </p>
          <p class="text-lg font-semibold">
            [{formatNumber(r.reliability.confidenceInterval95.lower, 2)}, {formatNumber(r.reliability.confidenceInterval95.upper, 2)}]
          </p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Coefficient of Variation" {showExplanations} />
          </p>
          <p class="text-lg font-semibold">{formatNumber(r.reliability.coefficientOfVariation)}</p>
        </div>
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Normality Flag" {showExplanations} />
          </p>
          <span class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium {flagBadgeClass(r.reliability.normalityFlag)}">
            {r.reliability.normalityFlag}
          </span>
        </div>
      </div>

      <!-- Normality assessment detail -->
      <div class="mt-4 rounded-lg bg-surface-secondary p-4">
        <h4 class="mb-2 text-xs font-semibold text-text-secondary">Normality Assessment</h4>
        <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div>
            <span class="text-xs text-text-secondary">Test</span>
            <p class="font-medium">{r.normalityAssessment.testName}</p>
          </div>
          <div>
            <span class="text-xs text-text-secondary">Statistic</span>
            <p class="font-medium tabular-nums">{formatNumber(r.normalityAssessment.testStatistic, 4)}</p>
          </div>
          <div>
            <span class="text-xs text-text-secondary">p-Value</span>
            <p class="font-medium tabular-nums">{formatNumber(r.normalityAssessment.pValue, 4)}</p>
          </div>
          <div>
            <span class="text-xs text-text-secondary">Skewness</span>
            <p class="font-medium tabular-nums">{formatNumber(r.normalityAssessment.skewness)}</p>
          </div>
          <div>
            <span class="text-xs text-text-secondary">Kurtosis</span>
            <p class="font-medium tabular-nums">{formatNumber(r.normalityAssessment.kurtosis)}</p>
          </div>
        </div>
      </div>
    </Card>

    <!-- ================================================================== -->
    <!-- Section 7: Recommendations                                         -->
    <!-- ================================================================== -->
    <Card title="Recommendations">
      <p class="mb-2 text-sm text-text-secondary">
        {r.formulaValidation.shipRateReliability}
      </p>
      <p class="mb-4 text-sm text-text-secondary">
        {r.formulaValidation.dataQualityAssessment}
      </p>

      {#if r.formulaValidation.recommendations.length > 0}
        <ul class="list-inside list-disc space-y-1 text-sm">
          {#each r.formulaValidation.recommendations as rec}
            <li>{rec}</li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-text-secondary">No specific recommendations.</p>
      {/if}

      <!-- Factor ranking -->
      {#if r.formulaValidation.factorRanking.length > 0}
        <div class="mt-4">
          <h4 class="mb-2 text-xs font-semibold text-text-secondary">Factor Ranking by Empirical Power</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border text-left text-xs text-text-secondary">
                  <th class="pb-2 pr-4">#</th>
                  <th class="pb-2 pr-4">Feature</th>
                  <th class="pb-2 pr-4 text-right">|Partial Corr.|</th>
                  <th class="pb-2">Significant</th>
                </tr>
              </thead>
              <tbody>
                {#each r.formulaValidation.factorRanking as item, idx}
                  <tr class="border-b border-border-light">
                    <td class="py-2 pr-4 text-text-secondary">{idx + 1}</td>
                    <td class="py-2 pr-4 font-medium">{featureLabel(item.feature)}</td>
                    <td class="py-2 pr-4 text-right tabular-nums">{formatNumber(item.absPartialCorrelation)}</td>
                    <td class="py-2">
                      {#if item.isSignificant}
                        <span class="text-green-600">✓</span>
                      {:else}
                        <span class="text-text-secondary">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- Mismatches -->
      {#if r.formulaValidation.mismatches.multiplicativeFactorsWithLowWeight.length > 0 || r.formulaValidation.mismatches.additiveFactorsWithDominantWeight.length > 0}
        <div class="mt-4 rounded-lg bg-yellow-50 p-4">
          <h4 class="mb-2 text-xs font-semibold text-yellow-800">Formula Mismatches</h4>
          {#if r.formulaValidation.mismatches.multiplicativeFactorsWithLowWeight.length > 0}
            <p class="text-xs text-yellow-800">
              Multiplicative factors with low weight: <strong>{r.formulaValidation.mismatches.multiplicativeFactorsWithLowWeight.join(", ")}</strong>
            </p>
          {/if}
          {#if r.formulaValidation.mismatches.additiveFactorsWithDominantWeight.length > 0}
            <p class="mt-1 text-xs text-yellow-800">
              Additive factors with dominant weight: <strong>{r.formulaValidation.mismatches.additiveFactorsWithDominantWeight.join(", ")}</strong>
            </p>
          {/if}
        </div>
      {/if}
    </Card>

    <!-- ================================================================== -->
    <!-- Section 8: Skipped Clusters                                        -->
    <!-- ================================================================== -->
    {#if skipped.length > 0}
      <Card title="Skipped Clusters">
        <p class="mb-3 text-xs text-text-secondary">
          {skipped.length} cluster(s) were excluded from calibration.
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-text-secondary">
                <th class="pb-2 pr-4">Cluster ID</th>
                <th class="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {#each skipped as entry}
                <tr class="border-b border-border-light">
                  <td class="py-2 pr-4 font-mono text-xs">{entry.clusterId}</td>
                  <td class="py-2 text-xs text-text-secondary">{entry.reason}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    {/if}
  </main>
</div>

<!-- Cluster detail slide-in panel -->
{#if selectedCluster}
  <ClusterDetailPanel
    cluster={selectedCluster}
    residual={selectedResidual}
    cacheDetails={clusterCacheDetails}
    cacheLoading={clusterCacheLoading}
    cacheError={clusterCacheError}
    {hourlyRate}
    onclose={() => {
      selectedClusterId = null;
      clusterCacheDetails = null;
      clusterCacheError = null;
      clusterCacheLoading = false;
    }}
  />
{/if}
