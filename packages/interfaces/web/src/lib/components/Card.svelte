<!--
  Card component — consistent container for result sections.

  Used throughout the center and right panels for each distinct section
  (ticket info, pipeline steps, ISV result, calibration data).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title = '',
    children,
  }: {
    title?: string;
    children: Snippet;
  } = $props();
</script>

<div class="rounded-xl border border-border bg-surface p-5 shadow-sm">
  {#if title}
    <h3 class="mb-4 text-sm font-semibold tracking-wide text-text-secondary uppercase">{title}</h3>
  {/if}
  {@render children()}
</div>
