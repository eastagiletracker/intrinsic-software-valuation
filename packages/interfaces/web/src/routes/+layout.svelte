<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="flex h-screen overflow-hidden bg-surface-secondary font-sans">
  {@render children()}
</div>
