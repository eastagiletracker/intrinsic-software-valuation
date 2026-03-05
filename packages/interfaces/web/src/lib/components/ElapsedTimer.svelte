<!--
  Elapsed timer — displays a mm:ss counter while running.

  Starts counting when `running` is true, stops and shows final time
  when `running` becomes false. Uses Date.now() to stay accurate even
  when the browser tab is backgrounded.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let {
    running = false,
  }: {
    running?: boolean;
  } = $props();

  let elapsed = $state(0);
  let startTime = $state(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function tick() {
    if (startTime > 0) {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
    }
  }

  function startTimer() {
    stopTimer();
    startTime = Date.now();
    elapsed = 0;
    intervalId = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  $effect(() => {
    if (running) {
      startTimer();
    } else {
      stopTimer();
    }
  });

  onMount(() => {
    return () => stopTimer();
  });

  let formattedTime = $derived(() => {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  });
</script>

<span class="font-mono text-sm tabular-nums text-text-secondary">⏱ {formattedTime()}</span>
