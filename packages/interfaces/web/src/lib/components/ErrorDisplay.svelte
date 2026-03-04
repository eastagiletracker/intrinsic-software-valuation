<!--
  Error display — shows pipeline errors prominently (AC-2.5).
-->
<script lang="ts">
  let {
    code = '',
    message = '',
    source = '',
  }: {
    code?: string;
    message?: string;
    source?: string;
  } = $props();
</script>

<div class="rounded-xl border border-accent-red/30 bg-accent-red-extra-light p-5">
  <div class="flex items-start gap-3">
    <svg class="mt-0.5 h-5 w-5 shrink-0 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
    <div class="min-w-0 flex-1">
      {#if code}
        <p class="text-sm font-semibold text-accent-red">{code}</p>
      {/if}
      <p class="mt-1 text-sm text-text">{message}</p>
      {#if source}
        <p class="mt-2 text-xs text-text-secondary">Source: {source}</p>
      {/if}
    </div>
  </div>
</div>
