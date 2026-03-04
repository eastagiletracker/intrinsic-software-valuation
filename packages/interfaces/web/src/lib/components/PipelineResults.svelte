<!--
  Pipeline Step Results (AC-2.11 through AC-2.15).

  Displays intermediate results from each pipeline phase:
  - Status Quo Miner (code health reports)
  - Architecture Scanner (system contexts)
  - Health scores and C2 derivation
  - Commit provenance
  - Gap Analyzer results
-->
<script lang="ts">
  import Card from './Card.svelte';

  let {
    pipelineResults,
  }: {
    pipelineResults: {
      repositories?: Array<{
        repositoryId: string;
        codeHealthReport?: {
          structuralFacts: {
            totalLoc: number;
            fileCount: number;
          };
          healthScores: {
            complexity: {
              avgCyclomaticComplexity: number;
              duplicationPercentage: number;
              godClassCount: number;
            };
            testHealth: {
              coveragePercentage?: number;
              outdatedDependencies: number;
              deadCodeFiles: number;
            };
          };
        };
        systemContext?: {
          systemArchetype: string;
          techStack: { languages: string[]; frameworks: string[] };
          adapterCatalog: { adapters: Array<{ name: string; type: string }> };
          corePatterns: Array<{ name: string }>;
        };
        c2State?: number;
        provenance?: {
          commitSha: string;
          commitDate: string;
        };
      }>;
      effectiveC2?: number;
      gapAnalysis?: {
        meta: { actionability: string; confidence: string };
        architecturalFit: { summary: string };
        identifiedGaps: {
          data: string[];
          ui: string[];
          logic: string[];
          integration: string[];
        };
        requiredModifications: Array<{ description: string }>;
        isvScoring: {
          A1_Data: { score: number; rationale: string };
          A2_UX: { score: number; rationale: string };
          B1_Logic: { score: number; rationale: string };
          C1_Integration: { score: number; rationale: string };
          D3_Quality: { score: number; rationale: string };
        };
      };
    };
  } = $props();
</script>

<!-- Status Quo Miner Results (AC-2.11) -->
{#if pipelineResults.repositories}
  <Card title="Status Quo Miner — Code Health">
    <div class="space-y-4">
      {#each pipelineResults.repositories as repo}
        {#if repo.codeHealthReport}
          <div class="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <h4 class="mb-3 text-sm font-medium text-text">{repo.repositoryId}</h4>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-text-secondary">Total LOC</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.structuralFacts.totalLoc.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-secondary">Files</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.structuralFacts.fileCount.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-secondary">Avg Complexity</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.complexity.avgCyclomaticComplexity.toFixed(1)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-secondary">Duplication</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.complexity.duplicationPercentage.toFixed(1)}%</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-secondary">God Classes</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.complexity.godClassCount}</span>
              </div>
              {#if repo.codeHealthReport.healthScores.testHealth.coveragePercentage !== undefined}
                <div class="flex justify-between">
                  <span class="text-text-secondary">Test Coverage</span>
                  <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.testHealth.coveragePercentage.toFixed(1)}%</span>
                </div>
              {/if}
              <div class="flex justify-between">
                <span class="text-text-secondary">Outdated Deps</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.testHealth.outdatedDependencies}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-text-secondary">Dead Code Files</span>
                <span class="font-mono font-medium">{repo.codeHealthReport.healthScores.testHealth.deadCodeFiles}</span>
              </div>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </Card>
{/if}

<!-- Architecture Scanner Results (AC-2.12) -->
{#if pipelineResults.repositories?.some(r => r.systemContext)}
  <Card title="Architecture Scanner — System Context">
    <div class="space-y-4">
      {#each pipelineResults.repositories ?? [] as repo}
        {#if repo.systemContext}
          <div class="rounded-lg border border-border/50 bg-surface-secondary p-4">
            <h4 class="mb-3 text-sm font-medium text-text">{repo.repositoryId}</h4>
            <div class="space-y-2 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-text-secondary">Archetype:</span>
                <span class="rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{repo.systemContext.systemArchetype}</span>
              </div>
              {#if repo.systemContext.techStack.languages.length > 0}
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-text-secondary">Stack:</span>
                  {#each [...repo.systemContext.techStack.languages, ...repo.systemContext.techStack.frameworks] as tech}
                    <span class="rounded-full bg-surface-blue px-2 py-0.5 text-xs text-text-secondary">{tech}</span>
                  {/each}
                </div>
              {/if}
              {#if repo.systemContext.adapterCatalog.adapters.length > 0}
                <div>
                  <span class="text-text-secondary">Adapters:</span>
                  <span class="text-xs text-text-secondary/60"> {repo.systemContext.adapterCatalog.adapters.map(a => a.name).join(', ')}</span>
                </div>
              {/if}
              {#if repo.systemContext.corePatterns.length > 0}
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-text-secondary">Patterns:</span>
                  {#each repo.systemContext.corePatterns as pattern}
                    <span class="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">{pattern.name}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </Card>
{/if}

<!-- Health Scores & C2 Derivation (AC-2.13) -->
{#if pipelineResults.repositories?.some(r => r.c2State !== undefined)}
  <Card title="Health Scores — C2 State Factor">
    <div class="space-y-3">
      {#each pipelineResults.repositories ?? [] as repo}
        {#if repo.c2State !== undefined}
          <div class="flex items-center justify-between rounded-lg border border-border/50 bg-surface-secondary px-4 py-3 text-sm">
            <span class="text-text-secondary">{repo.repositoryId}</span>
            <span class="rounded bg-brand/10 px-2.5 py-1 font-mono text-sm font-bold text-brand">C2 = {repo.c2State}</span>
          </div>
        {/if}
      {/each}
      {#if pipelineResults.effectiveC2 !== undefined}
        <div class="flex items-center justify-between rounded-lg border-2 border-brand/20 bg-surface-blue px-4 py-3">
          <span class="text-sm font-medium text-text">Effective C2 (max across repos)</span>
          <span class="rounded bg-brand px-3 py-1 font-mono text-sm font-bold text-text-inverse">C2 = {pipelineResults.effectiveC2}</span>
        </div>
      {/if}
    </div>
  </Card>
{/if}

<!-- Commit Provenance (AC-2.14) -->
{#if pipelineResults.repositories?.some(r => r.provenance)}
  <Card title="Commit Provenance">
    <div class="space-y-2">
      {#each pipelineResults.repositories ?? [] as repo}
        {#if repo.provenance}
          <div class="flex items-center justify-between rounded-lg border border-border/50 bg-surface-secondary px-4 py-3 text-sm">
            <span class="text-text-secondary">{repo.repositoryId}</span>
            <div class="flex items-center gap-3">
              <code class="rounded bg-brand-dark/5 px-2 py-0.5 text-xs text-text-secondary">{repo.provenance.commitSha.slice(0, 8)}</code>
              <span class="text-xs text-text-secondary/60">{new Date(repo.provenance.commitDate).toLocaleString()}</span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </Card>
{/if}

<!-- Gap Analyzer Results (AC-2.15) -->
{#if pipelineResults.gapAnalysis}
  <Card title="Gap Analyzer">
    <!-- Meta -->
    <div class="mb-4 flex items-center gap-4 text-sm">
      <div class="flex items-center gap-2">
        <span class="text-text-secondary">Actionability:</span>
        <span class="rounded bg-surface-blue px-2 py-0.5 text-xs font-medium text-brand">{pipelineResults.gapAnalysis.meta.actionability}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-text-secondary">Confidence:</span>
        <span class="rounded bg-surface-blue px-2 py-0.5 text-xs font-medium text-brand">{pipelineResults.gapAnalysis.meta.confidence}</span>
      </div>
    </div>

    <!-- Architectural Fit -->
    <div class="mb-4 rounded-lg bg-surface-secondary p-3">
      <h5 class="mb-1 text-xs font-semibold text-text-secondary uppercase">Architectural Fit</h5>
      <p class="text-sm text-text">{pipelineResults.gapAnalysis.architecturalFit.summary}</p>
    </div>

    <!-- Identified Gaps (4 dimensions) -->
    <div class="mb-4 grid grid-cols-2 gap-3">
      {#each ['data', 'ui', 'logic', 'integration'] as dim}
        {@const gaps = pipelineResults.gapAnalysis.identifiedGaps[dim as keyof typeof pipelineResults.gapAnalysis.identifiedGaps]}
        <div class="rounded-lg border border-border/50 p-3">
          <h5 class="mb-2 text-xs font-semibold text-text-secondary uppercase">{dim} gaps</h5>
          {#if gaps.length > 0}
            <ul class="space-y-1">
              {#each gaps as gap}
                <li class="text-xs text-text-secondary">• {gap}</li>
              {/each}
            </ul>
          {:else}
            <p class="text-xs text-text-secondary/50">None identified</p>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Required Modifications -->
    {#if pipelineResults.gapAnalysis.requiredModifications.length > 0}
      <div class="mb-4">
        <h5 class="mb-2 text-xs font-semibold text-text-secondary uppercase">Required Modifications</h5>
        <ul class="space-y-1.5">
          {#each pipelineResults.gapAnalysis.requiredModifications as mod}
            <li class="rounded bg-surface-secondary px-3 py-2 text-sm text-text">{mod.description}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <!-- ISV Scoring with rationales -->
    <div>
      <h5 class="mb-2 text-xs font-semibold text-text-secondary uppercase">ISV Factor Scoring</h5>
      <div class="space-y-2">
        {#each [
          { key: 'A1_Data', label: 'A1 Data Value' },
          { key: 'A2_UX', label: 'A2 UX Multiplier' },
          { key: 'B1_Logic', label: 'B1 Logic Value' },
          { key: 'C1_Integration', label: 'C1 Integration' },
          { key: 'D3_Quality', label: 'D3 Quality' },
        ] as factor}
          {@const scoring = pipelineResults.gapAnalysis.isvScoring[factor.key as keyof typeof pipelineResults.gapAnalysis.isvScoring]}
          <div class="flex items-start gap-3 rounded-lg border border-border/30 px-3 py-2">
            <span class="shrink-0 rounded bg-brand/10 px-2 py-0.5 font-mono text-xs font-bold text-brand">{scoring.score}</span>
            <div class="min-w-0">
              <span class="text-xs font-medium text-text">{factor.label}</span>
              <p class="mt-0.5 text-xs text-text-secondary">{scoring.rationale}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </Card>
{/if}
