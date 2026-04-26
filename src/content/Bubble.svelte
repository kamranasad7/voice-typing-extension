<!--
  svelte-check doesn't read vitePlugin.dynamicCompileOptions, so it warns
  about customElement here. The Vite plugin compiles this file with
  customElement: true — see svelte.config.js.
-->
<!-- svelte-ignore options_missing_custom_element -->
<svelte:options
  customElement={{
    tag: 'sti-bubble',
    shadow: 'open',
    props: {
      state: { reflect: false },
      message: { reflect: false },
    },
  }}
/>

<script lang="ts">
  type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

  const LABELS: Record<BubbleState, string> = {
    idle: 'Record',
    listening: 'Listening…',
    processing: 'Processing…',
    success: '',
    error: 'Error',
  };

  let {
    state = 'idle',
    message = '',
  }: { state?: BubbleState; message?: string } = $props();

  const dotIndices = Array.from({ length: 12 }, (_, i) => i + 1);

  function requestRecord(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.stop-btn')) return;
    if (state !== 'idle') return;
    $host().dispatchEvent(new CustomEvent('record-request'));
  }

  function requestStop(e: MouseEvent) {
    e.stopPropagation();
    $host().dispatchEvent(new CustomEvent('stop-request'));
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (state !== 'idle') return;
    e.preventDefault();
    $host().dispatchEvent(new CustomEvent('record-request'));
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

<style>
  :host { all: initial; }

  .bubble {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(20, 20, 20, 0.92);
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1;
    border-radius: 999px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(8px);
    overflow: hidden;
    white-space: nowrap;
    cursor: default;
    pointer-events: auto;
    transition:
      width 180ms ease-out,
      height 180ms ease-out,
      padding 180ms ease-out,
      background 200ms ease-out;
  }

  .bubble.idle {
    width: 56px;
    height: 6px;
    padding: 0;
    cursor: pointer;
  }
  .bubble.idle .content { opacity: 0; }
  .bubble.idle:hover {
    width: 110px;
    height: 32px;
    padding: 0 16px;
  }
  .bubble.idle:hover .content { opacity: 1; }

  .bubble.listening,
  .bubble.processing,
  .bubble.error,
  .bubble.success {
    height: 36px;
    padding: 0 16px;
  }

  .bubble.error { background: rgba(180, 40, 40, 0.95); }
  .bubble.success {
    background: rgba(6, 18, 9, 0.95);
    width: 56px;
    padding: 0;
  }

  .bubble.listening {
    height: 56px;
    padding: 0 36px;
    border-radius: 15px;
  }

  .content {
    display: flex;
    align-items: center;
    gap: 10px;
    transition: opacity 140ms ease-out;
  }
  .bubble.listening .content {
    flex-direction: column;
    gap: 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff5252;
    flex: none;
  }
  .bubble.idle .dot,
  .bubble.listening .dot,
  .bubble.processing .dot,
  .bubble.success .dot,
  .bubble.error .dot { display: none; }
  .bubble.error .dot {
    display: block;
    background: #fff;
    animation: none;
  }

  .dots {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 10px;
  }
  .bubble.listening .dots { display: flex; }
  .dots .d {
    width: 4px;
    height: 6px;
    border-radius: 999px;
    background: #b06cff;
    animation: stti-wave 1.1s ease-in-out infinite;
  }
  .dots .d1  { animation-delay: -1.10s; }
  .dots .d2  { animation-delay: -1.00s; }
  .dots .d3  { animation-delay: -0.90s; }
  .dots .d4  { animation-delay: -0.80s; }
  .dots .d5  { animation-delay: -0.70s; }
  .dots .d6  { animation-delay: -0.60s; }
  .dots .d7  { animation-delay: -0.50s; }
  .dots .d8  { animation-delay: -0.40s; }
  .dots .d9  { animation-delay: -0.30s; }
  .dots .d10 { animation-delay: -0.20s; }
  .dots .d11 { animation-delay: -0.10s; }
  .dots .d12 { animation-delay:  0s;    }

  .check {
    display: none;
    width: 18px;
    height: 18px;
    color: #22c55e;
  }
  .bubble.success .check { display: block; }
  .bubble.success .label { display: none; }

  .stop-btn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: background 120ms ease-out;
  }
  .stop-btn:hover { background: rgba(255, 255, 255, 0.24); }
  .bubble.listening .stop-btn { display: flex; }

  .label { letter-spacing: 0.2px; }
  .bubble.listening .label { display: none; }
  .bubble.processing .label {
    font-size: 11px;
    color: #c8a8ff;
    letter-spacing: 0.4px;
  }

  @keyframes stti-wave {
    0%, 100% { height: 2px; opacity: 0.6; }
    50%      { height: 8px; opacity: 1;   }
  }
</style>
