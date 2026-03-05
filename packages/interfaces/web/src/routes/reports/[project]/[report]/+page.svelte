<script lang="ts">
  import type { PageData } from "./$types.js";
  import Card from "$lib/components/Card.svelte";
  import Tooltip from "$lib/components/Tooltip.svelte";
  import ClusterScatterChart from "$lib/components/ClusterScatterChart.svelte";
  import ResidualChart from "$lib/components/ResidualChart.svelte";
  import { featureLabel } from "$lib/components/feature-labels.js";

  let { data }: { data: PageData } = $props();

  let showExplanations = $state(false);

  const r = $derived(data.report.result);
  const residuals = $derived(data.report.residuals);
  const clusters = $derived(data.report.clusters);
  const skipped = $derived(data.report.skippedClusters);

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

  // Scatter chart data: ISV score vs actual tracked hours
  const scatterData = $derived(
    clusters.map((c) => ({
      x: c.isvAnalysis.isvScore,
      y: c.metrics.totalHours,
      label: c.clusterId,
    })),
  );

  // Residual chart data
  const residualData = $derived(
    residuals.map((r) => ({
      x: r.predictedHours,
      y: r.residual,
      label: r.clusterId,
      isOutlier: r.isOutlier,
    })),
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
    <!-- Section 1: Executive Summary                                       -->
    <!-- ================================================================== -->
    <Card title="Executive Summary">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="Ship Rate" {showExplanations} />
          </p>
          <p class="text-xl font-bold text-brand">
            {formatNumber(r.shipRateHoursPerIsv, 2)} <span class="text-xs font-normal text-text-secondary">h / ISV</span>
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
          <p class="text-xl font-bold text-text">{formatNumber(r.dataQualityScore)}</p>
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
          <p class="text-lg font-semibold text-text">{formatNumber(r.shipRateExclOutliers, 2)} h/ISV</p>
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
        <ClusterScatterChart data={scatterData} />
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
        <ResidualChart data={residualData} />
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
      {/if}
    </Card>

    <!-- ================================================================== -->
    <!-- Section 6: Data Quality & Reliability                              -->
    <!-- ================================================================== -->
    <Card title="Data Quality & Reliability">
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p class="text-xs text-text-secondary">
            <Tooltip term="DQS" {showExplanations} />
          </p>
          <p class="text-lg font-semibold">{formatNumber(r.reliability.dataQualityScore)}</p>
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
