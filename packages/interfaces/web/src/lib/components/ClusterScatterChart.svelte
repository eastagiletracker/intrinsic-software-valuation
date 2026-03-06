<!--
  Scatter chart: ISV-derived comparison value vs. actual tracked hours.

  AC-5: Wording avoids prediction semantics — uses "ISV-derived comparison value"
  and "actual tracked hours".
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
    data: Array<{ x: number; y: number; label: string; ids: string[] }>;
    selectedLabel?: string | null;
    onpointclick?: (label: string) => void;
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
    <Points r={5} let:points>
      {#each points as point}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <circle
          cx={point.x}
          cy={point.y}
          r={point.r}
          class="stroke-surface stroke-1 cursor-pointer transition-colors {point.data.label === selectedLabel ? 'fill-brand-dark' : 'fill-brand'}"
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
        <p>ISV: {data.x.toFixed(1)}</p>
        <p>Hours: {data.y.toFixed(1)}</p>
        <p class="mt-1 text-text-secondary italic">Click for details</p>
      </div>
    {/if}
  </Tooltip.Root>
</Chart>
