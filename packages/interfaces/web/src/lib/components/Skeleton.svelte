<!--
  Skeleton / shimmer loading placeholder.

  Renders a pulsing placeholder that matches the card layout structure
  so the page does not shift when data arrives. (AC-2.4, AC-S.10)
-->
<script lang="ts">
  let {
    lines = 3,
    showTitle = true,
  }: {
    lines?: number;
    showTitle?: boolean;
  } = $props();
</script>

<div class="animate-pulse space-y-4">
  {#if showTitle}
    <div class="h-5 w-1/3 rounded bg-border"></div>
  {/if}
  {#each Array(lines) as _}
    <div class="h-4 rounded bg-border/60" style="width: {60 + Math.random() * 40}%"></div>
  {/each}
</div>
