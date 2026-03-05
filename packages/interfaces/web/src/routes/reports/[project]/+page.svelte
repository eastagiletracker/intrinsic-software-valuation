<script lang="ts">
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatPeriod(start: string, end: string): string {
    return `${start} → ${end}`;
  }
</script>

<svelte:head>
  <title>Calibration Reports — {data.projectSlug}</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
  <!-- Header -->
  <header class="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
    <div>
      <a href="/" class="text-xs text-text-secondary hover:text-brand">← Dashboard</a>
      <h1 class="mt-1 text-lg font-semibold text-text">
        Calibration Reports
      </h1>
      <p class="text-sm text-text-secondary">Project: {data.projectSlug}</p>
    </div>
  </header>

  <!-- Report list -->
  <main class="flex-1 overflow-y-auto p-6">
    {#if data.reports.length === 0}
      <div class="rounded-xl border border-border bg-surface p-8 text-center">
        <p class="text-sm text-text-secondary">
          No calibration reports found for this project.
        </p>
        <p class="mt-2 text-xs text-text-secondary">
          Run <code class="rounded bg-surface-secondary px-1.5 py-0.5 text-xs">isv calibrate --project {data.projectSlug}</code> to generate a report.
        </p>
      </div>
    {:else}
      <div class="grid gap-4">
        {#each data.reports as report}
          <a
            href="/reports/{data.projectSlug}/{report.slug}"
            class="group rounded-xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-sm font-semibold text-text group-hover:text-brand">
                  {formatPeriod(report.periodStart, report.periodEnd)}
                </h2>
                <p class="mt-1 text-xs text-text-secondary">
                  Created: {formatDate(report.createdAt)}
                </p>
              </div>
              <span class="rounded-full px-2.5 py-0.5 text-xs font-medium {fitBadgeClass(report.fitAssessment)}">
                {report.fitAssessment}
              </span>
            </div>
            <div class="mt-3 flex gap-6 text-xs text-text-secondary">
              <span>Sample size: <strong class="text-text">{report.sampleSize}</strong></span>
              <span>R²: <strong class="text-text">{report.rSquared.toFixed(3)}</strong></span>
              <span>Period: <strong class="text-text">{report.periodStart} – {report.periodEnd}</strong></span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>
