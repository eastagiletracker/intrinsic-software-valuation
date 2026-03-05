<!--
  Panel 1 — Project Selector Sidebar

  Lists all available projects derived from data/ subdirectories.
  Allows selecting one project as the active context.
  Supports collapsed (icon rail) and expanded states.

  AC-1.1 through AC-1.6, AC-UI-1.1 through AC-UI-1.9
-->
<script lang="ts">
  import type { ProjectEntry } from '$lib/types/index.js';

  let {
    projects,
    activeSlug = null,
    onselect,
    collapsed = false,
    ontoggle,
  }: {
    projects: ProjectEntry[];
    activeSlug: string | null;
    onselect: (slug: string) => void;
    collapsed?: boolean;
    ontoggle?: () => void;
  } = $props();
</script>

<!-- AC-UI-1.7: Smooth CSS transition on width (~200ms) -->
<!-- AC-UI-1.2/AC-UI-1.3: Expanded w-72, collapsed w-14 -->
<aside
  class="flex shrink-0 flex-col border-r border-white/30 bg-brand-dark text-text-inverse transition-[width] duration-200 ease-in-out"
  class:w-72={!collapsed}
  class:w-14={collapsed}
>
  <!-- Logo header -->
  <div class="flex items-center border-b border-white/10" class:justify-center={collapsed} class:px-5={!collapsed} class:py-5={true} class:px-2={collapsed}>
    {#if collapsed}
      <!-- AC-UI-1.3: Compact brackets logo in collapsed state -->
      <img src="/BITGRIP_Brackets_White_sRGB.png" alt="Bitgrip" class="h-6" />
    {:else}
      <img src="/logo_bitgrip.png" alt="Bitgrip" class="h-6" />
      <span class="ml-3 text-xs font-light tracking-wider text-white/60 uppercase">ISV Engine</span>
    {/if}
  </div>

  <!-- Project list -->
  <nav class="flex-1 overflow-y-auto" class:px-3={!collapsed} class:px-1={collapsed} class:py-4={true}>
    {#if !collapsed}
      <h2 class="mb-3 px-2 text-xs font-medium tracking-wider text-white/50 uppercase">Projects</h2>
    {/if}

    {#if projects.length === 0}
      {#if !collapsed}
        <!-- AC-1.6: Empty state (expanded) -->
        <div class="rounded-lg bg-white/5 px-4 py-6 text-center">
          <svg class="mx-auto mb-3 h-8 w-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
          <p class="text-sm leading-relaxed text-white/50">
            No projects found.<br />
            Add a folder with <code class="rounded bg-white/10 px-1 py-0.5 text-xs">project-config.json</code> to <code class="rounded bg-white/10 px-1 py-0.5 text-xs">data/</code>
          </p>
        </div>
      {/if}
      <!-- Collapsed empty state: only logo and toggle shown (no project icons) -->
    {:else}
      <ul class="space-y-1">
        {#each projects as project (project.slug)}
          <li>
            {#if collapsed}
              <!-- AC-UI-1.3/AC-UI-1.5: Icon-only project entry in collapsed rail -->
              <button
                type="button"
                class="group flex w-full items-center justify-center rounded-lg py-2.5 transition-colors
                  {activeSlug === project.slug
                    ? 'bg-brand text-white font-medium shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'}"
                onclick={() => onselect(project.slug)}
                title={project.name}
              >
                <!-- AC-UI-1.4: Active project visually highlighted -->
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md
                  {activeSlug === project.slug ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}">
                  <span class="text-xs font-bold uppercase">
                    {project.ticketPrefix.slice(0, 2)}
                  </span>
                </span>
              </button>
            {:else}
              <!-- Expanded project entry (existing behavior, AC-UI-1.2) -->
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
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </nav>

  <!-- Toggle + Footer -->
  <div class="border-t border-white/10">
    <!-- AC-UI-1.1/AC-UI-1.6: Collapse/expand toggle -->
    {#if ontoggle}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        class:justify-center={collapsed}
        onclick={ontoggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {#if collapsed}
          <!-- AC-UI-1.6: Chevron-right when collapsed → expand -->
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m13.5 4.5 7.5 7.5-7.5 7.5m-6-15 7.5 7.5-7.5 7.5" />
          </svg>
        {:else}
          <!-- AC-UI-1.6: Chevron-left when expanded → collapse -->
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="m18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5" />
          </svg>
          <span class="text-xs">Collapse</span>
        {/if}
      </button>
    {/if}
    <!-- AC-UI-1.9: Footer version label hidden in collapsed state -->
    {#if !collapsed}
      <div class="px-5 py-3">
        <p class="text-xs text-white/30">ISV Engine v0.0.1</p>
      </div>
    {/if}
  </div>
</aside>
