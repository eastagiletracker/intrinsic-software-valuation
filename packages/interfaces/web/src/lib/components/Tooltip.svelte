<!--
  Term explanation tooltip component.

  Shows a dotted-underline term with a hover tooltip.
  When the global `showExplanations` flag is true, explanations are always
  visible inline instead of requiring hover.
-->
<script lang="ts">
  import { glossary } from "./glossary.js";

  let {
    term,
    showExplanations = false,
  }: {
    /** The glossary term key to look up. */
    term: string;
    /** When true, shows the explanation inline instead of on hover. */
    showExplanations?: boolean;
  } = $props();

  const explanation = $derived(glossary[term] ?? "");
</script>

{#if explanation}
  <span class="relative inline-block">
    <span
      class="cursor-help border-b border-dotted border-text-secondary text-text"
      title={explanation}
    >
      {term}
    </span>
    {#if showExplanations}
      <span class="ml-1 text-xs text-text-secondary">
        — {explanation}
      </span>
    {/if}
  </span>
{:else}
  <span>{term}</span>
{/if}
