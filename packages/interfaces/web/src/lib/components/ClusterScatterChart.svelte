<!--
  Scatter chart: ISV-derived comparison value vs. actual tracked hours.

  AC-5: Wording avoids prediction semantics — uses "ISV-derived comparison value"
  and "actual tracked hours".
  AC-7: Uses layerchart for chart visualizations.
-->
<script lang="ts">
  import { Chart, Svg, Axis, Points, Tooltip } from "layerchart";
  import { scaleLinear } from "d3-scale";
  import { extent } from "d3-array";

  let {
    data,
  }: {
    data: Array<{ x: number; y: number; label: string }>;
  } = $props();

  const xExtent = $derived(extent(data, (d: { x: number }) => d.x) as [number, number]);
  const yExtent = $derived(extent(data, (d: { y: number }) => d.y) as [number, number]);
  const xDomain = $derived([
    (xExtent[0] ?? 0) * 0.9,
    (xExtent[1] ?? 1) * 1.1,
  ]);
  const yDomain = $derived([
    (yExtent[0] ?? 0) * 0.9,
    (yExtent[1] ?? 1) * 1.1,
  ]);
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
    <Axis placement="bottom" label="ISV-derived comparison value" />
    <Axis placement="left" label="Actual tracked hours" />
    <Points r={5} class="fill-brand stroke-surface stroke-1" />
  </Svg>
  <Tooltip.Root let:data>
    {#if data}
      <div class="rounded bg-surface px-2 py-1 text-xs shadow-md border border-border">
        <p class="font-mono">{data.label}</p>
        <p>ISV: {data.x.toFixed(1)}</p>
        <p>Hours: {data.y.toFixed(1)}</p>
      </div>
    {/if}
  </Tooltip.Root>
</Chart>
