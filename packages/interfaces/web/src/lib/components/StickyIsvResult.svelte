<!--
  Sticky ISV Result Bar — always visible at the bottom of Panel 2.

  Shows a compact summary of the ISV score and ticket ID.
  AC-UI-2.1 through AC-UI-2.8
-->
<script lang="ts">
  let {
    result,
  }: {
    result: {
      ticketId: string;
      isvScore: number;
      breakdown: {
        poValue: number;
        archFactor: number;
        qualityMultiplier: number;
      };
    };
  } = $props();
</script>

<!-- AC-UI-2.1: Fixed bar at bottom of center panel, always visible -->
<!-- AC-UI-2.5: Only rendered when isvResult is non-null (handled by parent) -->
<!-- AC-UI-2.6: Brand border + text-brand score color for visual continuity -->
<div class="sticky bottom-0 z-20 border-t-2 border-brand/30 bg-surface px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
  <div class="flex items-center justify-between gap-4">
    <!-- AC-UI-2.2: Ticket ID + ISV score at a glance -->
    <div class="flex items-center gap-3">
      <span class="text-xs font-medium tracking-wider text-text-secondary uppercase">ISV</span>
      <span class="text-2xl font-bold text-brand">{result.isvScore.toFixed(2)}</span>
    </div>

    <!-- AC-UI-2.3: Compact formula breakdown (optional) -->
    <div class="flex items-center gap-4 text-xs text-text-secondary">
      <a href="https://bitgrip.atlassian.net/browse/{result.ticketId}" target="_blank" rel="noopener noreferrer" class="font-mono hover:underline">{result.ticketId}</a>
      <span class="text-border">|</span>
      <span>PO: <span class="font-mono font-medium text-text">{result.breakdown.poValue.toFixed(2)}</span></span>
      <span>Arch: <span class="font-mono font-medium text-text">{result.breakdown.archFactor.toFixed(2)}</span></span>
      <span>Qual: <span class="font-mono font-medium text-text">{result.breakdown.qualityMultiplier.toFixed(2)}</span></span>
    </div>
  </div>
</div>
