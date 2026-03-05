<!--
  Ticket Input — allows entering a ticket ID and triggering ISV calculation.

  AC-2.1: Input field for ticket identifier
  AC-2.2: Ticket prefix shown as non-editable label
  AC-2.3: Enter or button triggers calculation
  AC-2.4: Input and button disabled during calculation
-->
<script lang="ts">
  let {
    ticketPrefix,
    loading = false,
    oncalculate,
  }: {
    ticketPrefix: string;
    loading: boolean;
    oncalculate: (ticketId: string) => void;
  } = $props();

  let ticketNumber = $state('');

  function handleSubmit() {
    const num = ticketNumber.trim();
    if (!num) return;
    oncalculate(`${ticketPrefix}-${num}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit();
  }
</script>

<div class="flex items-center gap-3">
  <div class="flex flex-1 items-center overflow-hidden rounded-lg border border-border bg-surface shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
    <!-- Prefix label (non-editable) -->
    <span class="shrink-0 border-r border-border bg-surface-secondary px-3 py-2.5 text-sm font-medium text-text-secondary">
      {ticketPrefix}-
    </span>
    <!-- Number input -->
    <input
      type="text"
      placeholder="123"
      bind:value={ticketNumber}
      onkeydown={handleKeydown}
      disabled={loading}
      class="w-full bg-transparent px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
    />
  </div>
  <button
    type="button"
    onclick={handleSubmit}
    disabled={loading || !ticketNumber.trim()}
    class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-brand/90 focus:ring-2 focus:ring-brand/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
  >
    {#if loading}
      <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Calculating…
    {:else}
      Calculate ISV
    {/if}
  </button>
</div>
