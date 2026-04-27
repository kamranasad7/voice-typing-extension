<script lang="ts">
  import { onMount } from 'svelte';

  type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

  const LABELS: Record<BubbleState, string> = {
    idle: 'Record',
    listening: 'Listening…',
    processing: 'Processing…',
    success: '',
    error: 'Error',
  };

  let {
    onRecord,
    onStop,
    register,
  }: {
    onRecord: () => void;
    onStop: () => void;
    register: (api: { setState: (state: BubbleState, message?: string) => void }) => void;
  } = $props();

  let state = $state<BubbleState>('idle');
  let message = $state('');

  // Hand the controller a setter so it can imperatively drive the UI without
  // needing to share a $state proxy across module boundaries. onMount makes
  // the intent explicit (vs. reading a prop at script top-level) and silences
  // Svelte's state_referenced_locally warning.
  onMount(() => {
    register({
      setState(s, m) {
        state = s;
        message = m ?? '';
      },
    });
  });

  const dotIndices = Array.from({ length: 12 }, (_, i) => i + 1);

  function requestRecord(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.stop-btn')) return;
    if (state !== 'idle') return;
    onRecord();
  }

  function requestStop(e: MouseEvent) {
    e.stopPropagation();
    onStop();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (state !== 'idle') return;
    e.preventDefault();
    onRecord();
  }

  // Don't let mousedown on the bubble steal focus from the page's input.
  function preventFocus(e: MouseEvent) {
    e.preventDefault();
  }
</script>

<div
  class="bubble {state}"
  role="button"
  tabindex="0"
  aria-label={message || LABELS[state] || 'Start dictation'}
  onmousedown={preventFocus}
  onclick={requestRecord}
  onkeydown={onKeydown}
>
  <div class="content">
    <span class="dot"></span>
    <span class="dots">
      {#each dotIndices as i (i)}
        <span class="d d{i}"></span>
      {/each}
    </span>
    <span class="check">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        width="18"
        height="18"
      >
        <polyline points="5 12 10 17 19 7" />
      </svg>
    </span>
    <span class="label">{message || LABELS[state]}</span>
    <button
      type="button"
      class="stop-btn"
      aria-label="Stop recording"
      onclick={requestStop}
    >×</button>
  </div>
</div>
