<!--
  ISV Result display (AC-2.16 through AC-2.19).

  Shows the final ISV score prominently with formula breakdown,
  all six input factors, and formula version.
-->
<script lang="ts">
  let {
    result,
  }: {
    result: {
      formulaVersion: string;
      ticketId: string;
      isvScore: number;
      factors: {
        A1_Data: number;
        A2_UX: number;
        B1_Logic: number;
        C1_Integration: number;
        C2_State: number;
        D3_Quality: number;
      };
      breakdown: {
        poValue: number;
        archFactor: number;
        qualityMultiplier: number;
      };
    };
  } = $props();
</script>

<div class="rounded-xl border-2 border-brand/30 bg-surface p-6 shadow-md">
  <!-- ISV Score — prominent display (AC-2.16) -->
  <div class="mb-6 text-center">
    <p class="mb-1 text-xs font-medium tracking-wider text-text-secondary uppercase">Intrinsic Software Value</p>
    <p class="text-5xl font-bold text-brand">{result.isvScore.toFixed(2)}</p>
    <p class="mt-1 text-xs text-text-secondary">
      <a href="https://bitgrip.atlassian.net/browse/{result.ticketId}" target="_blank" rel="noopener noreferrer" class="hover:underline">{result.ticketId}</a> · Formula v{result.formulaVersion}
    </p>
  </div>

  <!-- Formula breakdown (AC-2.17) -->
  <div class="mb-5 rounded-lg bg-surface-blue p-4">
    <h4 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">Formula Breakdown</h4>
    <div class="space-y-2 text-sm">
      <div class="flex items-center justify-between">
        <span class="text-text-secondary">poValue <span class="text-xs text-text-secondary/50">(A1 × A2) + B1</span></span>
        <span class="font-mono font-medium text-text">{result.breakdown.poValue.toFixed(2)}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-text-secondary">archFactor <span class="text-xs text-text-secondary/50">C1 × C2</span></span>
        <span class="font-mono font-medium text-text">{result.breakdown.archFactor.toFixed(2)}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-text-secondary">qualityMultiplier <span class="text-xs text-text-secondary/50">D3</span></span>
        <span class="font-mono font-medium text-text">{result.breakdown.qualityMultiplier.toFixed(2)}</span>
      </div>
      <div class="border-t border-border pt-2">
        <p class="text-center font-mono text-xs text-text-secondary">
          ISV = {result.breakdown.poValue.toFixed(2)} × {result.breakdown.archFactor.toFixed(2)} × {result.breakdown.qualityMultiplier.toFixed(2)} = <strong class="text-brand">{result.isvScore.toFixed(2)}</strong>
        </p>
      </div>
    </div>
  </div>

  <!-- Six input factors (AC-2.18) -->
  <div>
    <h4 class="mb-3 text-xs font-semibold tracking-wide text-text-secondary uppercase">Input Factors</h4>
    <div class="grid grid-cols-3 gap-2">
      {#each [
        { key: 'A1_Data', label: 'A1 Data' },
        { key: 'A2_UX', label: 'A2 UX' },
        { key: 'B1_Logic', label: 'B1 Logic' },
        { key: 'C1_Integration', label: 'C1 Integration' },
        { key: 'C2_State', label: 'C2 State' },
        { key: 'D3_Quality', label: 'D3 Quality' },
      ] as factor}
        <div class="rounded-lg border border-border/50 bg-surface-secondary px-3 py-2 text-center">
          <p class="text-xs text-text-secondary">{factor.label}</p>
          <p class="mt-0.5 font-mono text-lg font-bold text-text">
            {result.factors[factor.key as keyof typeof result.factors]}
          </p>
        </div>
      {/each}
    </div>
  </div>

  <!-- Formula version (AC-2.19) -->
  <p class="mt-4 text-center text-xs text-text-secondary/50">
    Formula version: {result.formulaVersion}
  </p>
</div>
