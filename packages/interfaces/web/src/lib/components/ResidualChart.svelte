<!--
  Residual chart: predicted hours vs residual.

  Shows residuals from the calibration regression.
  Outlier points (|standardised residual| > 2) are highlighted in red.
  AC-7: Uses layerchart for chart visualizations.

  Points are clickable — fires `onpointclick` with the cluster ID.
-->
<script lang="ts">
  import { Chart, Svg, Axis, Points, Tooltip } from "layerchart";
  import { scaleLinear } from "d3-scale";
  import { extent } from "d3-array";

  let {
    data,
    selectedLabel = null,
    onpointclick,
  }: {
    data: Array<{ x: number; y: number; label: string; ids: string[]; isOutlier: boolean }>;
    selectedLabel?: string | null;
    onpointclick?: (label: string) => void;
  } = $props();

  const outlierCount = $derived(data.filter((d) => d.isOutlier).length);

  const xExtent = $derived(extent(data, (d: { x: number }) => d.x) as [number, number]);
  const yExtent = $derived(extent(data, (d: { y: number }) => d.y) as [number, number]);
  const xDomain = $derived([
    (xExtent[0] ?? 0) * 0.9,
    (xExtent[1] ?? 1) * 1.1,
  ]);
  const yMax = $derived(Math.max(Math.abs(yExtent[0] ?? 0), Math.abs(yExtent[1] ?? 0)) * 1.2);
  const yDomain = $derived([-yMax, yMax]);

  function pointFill(d: { isOutlier: boolean; label: string }): string {
    if (d.label === selectedLabel) return "var(--color-brand-dark)";
    if (d.isOutlier) return "var(--color-accent-red)";
    return "var(--color-brand)";
  }
</script>

<Chart
  {data}
  x="x"
  y="y"
  xScale={scaleLinear()}
  yScale={scaleLinear()}
  {xDomain}
  {yDomain}
  padding={{ top: 20, right: 20, bottom: 40, left: 50 }}
>
  <Svg>
    <Axis placement="bottom" label="ISV-derived comparison value (hours)" />
    <Axis placement="left" label="Residual (hours)" />
    <!-- Zero line -->
    <line
      x1="0%"
      x2="100%"
      y1="50%"
      y2="50%"
      stroke="var(--color-border)"
      stroke-dasharray="4"
    />
    <Points r={5} let:points>
      {#each points as point}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <circle
          cx={point.x}
          cy={point.y}
          r={point.r}
          fill={pointFill(point.data)}
          class="stroke-surface stroke-1 cursor-pointer transition-colors"
          onclick={() => onpointclick?.(point.data.label)}
        />
      {/each}
    </Points>
  </Svg>

  <Tooltip.Root let:data>
    {#if data}
      <div class="rounded bg-surface px-2 py-1 text-xs shadow-md border border-border">
        <p class="font-mono font-semibold">{data.label}</p>
        {#if data.ids.length > 1}
          <p class="text-text-secondary">{data.ids.join(", ")}</p>
        {/if}
        <p>Predicted: {data.x.toFixed(1)}h</p>
        <p>Residual: {data.y.toFixed(1)}h</p>
        {#if data.isOutlier}
          <p class="text-accent-red font-semibold">Outlier</p>
        {/if}
        <p class="mt-1 text-text-secondary italic">Click for details</p>
      </div>
    {/if}
  </Tooltip.Root>
</Chart>

<!-- Legend -->
{#if outlierCount > 0}
  <div class="mt-2 flex items-center gap-4 text-xs text-text-secondary">
    <span class="flex items-center gap-1.5">
      <span class="inline-block h-3 w-3 rounded-full bg-brand"></span>
      Normal
    </span>
    <span class="flex items-center gap-1.5">
      <span class="inline-block h-3 w-3 rounded-full bg-accent-red"></span>
      {outlierCount} outlier(s)
    </span>
  </div>
{/if}
