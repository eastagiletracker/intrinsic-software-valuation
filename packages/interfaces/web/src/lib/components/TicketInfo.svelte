<!--
  Ticket Information display (AC-2.6 through AC-2.10).

  Shows ticket title, type with icon, description (collapsible),
  subtasks, and comments.
-->
<script lang="ts">
  import Card from './Card.svelte';
  import { sanitizeHtml } from '$lib/sanitize-html';

  let {
    ticket,
  }: {
    ticket: {
      ticketId: string;
      type: string;
      title: string;
      description: string;
      parentId?: string;
      storyPoints?: number;
      labels: string[];
      comments: Array<{ author: string; body: string; createdAt: string }>;
      subtasks?: Array<{ ticketId: string; title: string }>;
    };
  } = $props();

  let descriptionExpanded = $state(false);
  let commentsExpanded = $state(false);

  /** Map ticket type to an icon character. */
  function typeIcon(type: string): string {
    const t = type.toLowerCase();
    if (t.includes('bug')) return '🐛';
    if (t.includes('story')) return '📖';
    if (t.includes('task')) return '✅';
    if (t.includes('subtask') || t.includes('sub-task')) return '📎';
    if (t.includes('epic')) return '⚡';
    return '📋';
  }
</script>

<Card title="Ticket">
  <!-- Header: type icon + title -->
  <div class="flex items-start gap-3">
    <span class="text-xl" title={ticket.type}>{typeIcon(ticket.type)}</span>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <a href="https://bitgrip.atlassian.net/browse/{ticket.ticketId}" target="_blank" rel="noopener noreferrer" class="rounded bg-surface-secondary px-2 py-0.5 text-xs font-medium text-text-secondary hover:underline">{ticket.ticketId}</a>
        <span class="rounded bg-surface-blue px-2 py-0.5 text-xs font-medium text-brand">{ticket.type}</span>
        {#if ticket.storyPoints !== undefined}
          <span class="rounded bg-accent-red-extra-light px-2 py-0.5 text-xs font-medium text-accent-red">{ticket.storyPoints} SP</span>
        {/if}
      </div>
      <h4 class="mt-1.5 text-base font-semibold text-text">{ticket.title}</h4>
    </div>
  </div>

  <!-- Labels -->
  {#if ticket.labels.length > 0}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each ticket.labels as label}
        <span class="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs text-text-secondary">{label}</span>
      {/each}
    </div>
  {/if}

  <!-- Description (collapsible) -->
  {#if ticket.description}
    <div class="mt-4 border-t border-border pt-4">
      <div
        class="ticket-html text-sm leading-relaxed text-text-secondary"
        class:line-clamp-3={!descriptionExpanded}
      >
        {@html sanitizeHtml(ticket.description)}
      </div>
      <button
        type="button"
        class="mt-2 text-xs font-medium text-brand hover:underline"
        onclick={() => descriptionExpanded = !descriptionExpanded}
      >
        {descriptionExpanded ? '▲ Collapse' : '▼ Show full description'}
      </button>
    </div>
  {/if}

  <!-- Subtasks -->
  {#if ticket.subtasks && ticket.subtasks.length > 0}
    <div class="mt-4 border-t border-border pt-4">
      <h5 class="mb-2 text-xs font-semibold tracking-wide text-text-secondary uppercase">Subtasks ({ticket.subtasks.length})</h5>
      <ul class="space-y-1">
        {#each ticket.subtasks as sub}
          <li class="flex items-center gap-2 text-sm text-text-secondary">
            <span class="text-xs">📎</span>
            <a href="https://bitgrip.atlassian.net/browse/{sub.ticketId}" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-text-secondary/60 hover:underline">{sub.ticketId}</a>
            <span>{sub.title}</span>
          </li>
        {/each}
      </ul>
    </div>
  {:else if ticket.subtasks !== undefined}
    <div class="mt-4 border-t border-border pt-4">
      <p class="text-xs text-text-secondary/50">No subtasks</p>
    </div>
  {/if}

  <!-- Comments (collapsed) -->
  {#if ticket.comments.length > 0}
    <div class="mt-4 border-t border-border pt-4">
      <button
        type="button"
        class="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-secondary uppercase hover:text-brand"
        onclick={() => commentsExpanded = !commentsExpanded}
      >
        Comments ({ticket.comments.length})
        <span class="text-xs">{commentsExpanded ? '▲' : '▼'}</span>
      </button>
      {#if commentsExpanded}
        <ul class="mt-3 space-y-3">
          {#each ticket.comments as comment}
            <li class="rounded-lg bg-surface-secondary p-3">
              <div class="flex items-center gap-2 text-xs text-text-secondary">
                <span class="font-medium">{comment.author}</span>
                <span class="text-text-secondary/40">·</span>
                <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="mt-1 text-sm text-text ticket-html">{@html sanitizeHtml(comment.body)}</div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <div class="mt-4 border-t border-border pt-4">
      <p class="text-xs text-text-secondary/50">No comments</p>
    </div>
  {/if}
</Card>
