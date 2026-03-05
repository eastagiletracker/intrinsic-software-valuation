<!--
  Residual chart: predicted hours vs residual.

  Shows residuals from the calibration regression.
  Outlier points (|standardised residual| > 2) are highlighted in red.
  AC-7: Uses layerchart for chart visualizations.
-->
<script lang="ts">
  import { Chart, Svg, Axis, Points, Tooltip } from "layerchart";
  import { scaleLinear } from "d3-scale";
  import { extent } from "d3-array";

  let {
    data,
  }: {
    data: Array<{ x: number; y: number; label: string; isOutlier: boolean }>;
  } = $props();

  const normal = $derived(data.filter((d) => !d.isOutlier));
  const outliers = $derived(data.filter((d) => d.isOutlier));

  const xExtent = $derived(extent(data, (d: { x: number }) => d.x) as [number, number]);
  const yExtent = $derived(extent(data, (d: { y: number }) => d.y) as [number, number]);
  const xDomain = $derived([
    (xExtent[0] ?? 0) * 0.9,
    (xExtent[1] ?? 1) * 1.1,
  ]);
  const yMax = $derived(Math.max(Math.abs(yExtent[0] ?? 0), Math.abs(yExtent[1] ?? 0)) * 1.2);
  const yDomain = $derived([-yMax, yMax]);
</script>

<Chart
  data={normal}
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
    <Points r={5} class="fill-brand stroke-surface stroke-1" />
  </Svg>

  <Tooltip.Root let:data>
    {#if data}
      <div class="rounded bg-surface px-2 py-1 text-xs shadow-md border border-border">
        <p class="font-mono">{data.label}</p>
        <p>Predicted: {data.x.toFixed(1)}h</p>
        <p>Residual: {data.y.toFixed(1)}h</p>
        {#if data.isOutlier}
          <p class="text-accent-red font-semibold">Outlier</p>
        {/if}
      </div>
    {/if}
  </Tooltip.Root>
</Chart>

<!-- Separate overlay for outlier points -->
{#if outliers.length > 0}
  <div class="mt-2 flex items-center gap-2 text-xs text-text-secondary">
    <span class="inline-block h-3 w-3 rounded-full bg-accent-red"></span>
    <span>{outliers.length} outlier(s) detected</span>
  </div>
{/if}
