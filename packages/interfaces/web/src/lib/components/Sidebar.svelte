<!--
  Panel 1 — Project Selector Sidebar

  Lists all available projects derived from data/ subdirectories.
  Allows selecting one project as the active context.

  AC-1.1 through AC-1.6
-->
<script lang="ts">
  import type { ProjectEntry } from '$lib/types/index.js';

  let {
    projects,
    activeSlug = null,
    onselect,
  }: {
    projects: ProjectEntry[];
    activeSlug: string | null;
    onselect: (slug: string) => void;
  } = $props();
</script>

<aside class="flex w-72 shrink-0 flex-col border-r border-white/30 bg-brand-dark text-text-inverse">
  <!-- Logo header -->
  <div class="flex items-center gap-3 border-b border-white/10 px-5 py-5">
    <img src="/logo_bitgrip.png" alt="Bitgrip" class="h-6" />
    <span class="text-xs font-light tracking-wider text-white/60 uppercase">ISV Engine</span>
  </div>

  <!-- Project list -->
  <nav class="flex-1 overflow-y-auto px-3 py-4">
    <h2 class="mb-3 px-2 text-xs font-medium tracking-wider text-white/50 uppercase">Projects</h2>

    {#if projects.length === 0}
      <!-- AC-1.6: Empty state -->
      <div class="rounded-lg bg-white/5 px-4 py-6 text-center">
        <svg class="mx-auto mb-3 h-8 w-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <p class="text-sm leading-relaxed text-white/50">
          No projects found.<br />
          Add a folder with <code class="rounded bg-white/10 px-1 py-0.5 text-xs">project-config.json</code> to <code class="rounded bg-white/10 px-1 py-0.5 text-xs">data/</code>
        </p>
      </div>
    {:else}
      <ul class="space-y-1">
        {#each projects as project (project.slug)}
          <li>
            <button
              type="button"
              class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors
                {activeSlug === project.slug
                  ? 'bg-brand text-white font-medium shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'}"
              onclick={() => onselect(project.slug)}
            >
              <!-- Project icon -->
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md
                {activeSlug === project.slug ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}">
                <span class="text-xs font-bold uppercase">
                  {project.ticketPrefix.slice(0, 2)}
                </span>
              </span>
              <span class="truncate">{project.name}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  <!-- Footer -->
  <div class="border-t border-white/10 px-5 py-3">
    <p class="text-xs text-white/30">ISV Engine v0.0.1</p>
  </div>
</aside>
