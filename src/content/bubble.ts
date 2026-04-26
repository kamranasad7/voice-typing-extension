export type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const HOST_ID = 'speech-to-input-bubble-host';

const STYLES = `
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

  /* Idle: small handle-like pill, content hidden until hover. Acts as a button. */
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

  /* Active states: full pill, always shown. */
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

  /* Listening pill: tall, with waveform + stop button stacked. */
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

  /* Single-dot indicator (listening / error). */
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

  /* Waveform indicator (processing) — vertical bars of varying heights, wave traveling. */
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

  /* Checkmark (success). */
  .check {
    display: none;
    width: 18px;
    height: 18px;
    color: #22c55e;
  }
  .bubble.success .check { display: block; }
  .bubble.success .label { display: none; }

  /* Stop button (listening only). */
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
    font-size: 11px;
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

  @keyframes stti-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(1.4); opacity: 0.55; }
  }
  @keyframes stti-wave {
    0%, 100% { height: 2px;  opacity: 0.6; }
    50%      { height: 8px; opacity: 1;   }
  }
`;

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="5 12 10 17 19 7" /></svg>`;

const LABELS: Record<BubbleState, string> = {
  idle: 'Record',
  listening: 'Listening…',
  processing: 'Processing…',
  success: '',
  error: 'Error',
};

class Bubble {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private el: HTMLDivElement | null = null;
  private labelEl: HTMLSpanElement | null = null;
  private revertTimer: number | null = null;

  onRecordRequest: (() => void) | null = null;
  onStopRequest: (() => void) | null = null;

  private ensure(): void {
    if (this.host && this.host.isConnected) return;

    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.host.style.all = 'initial';
    document.documentElement.appendChild(this.host);

    this.root = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.root.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'bubble idle';
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('tabindex', '0');
    this.el.setAttribute('aria-label', 'Start dictation');

    const content = document.createElement('div');
    content.className = 'content';

    const dot = document.createElement('span');
    dot.className = 'dot';

    const dots = document.createElement('span');
    dots.className = 'dots';
    for (let i = 1; i <= 12; i++) {
      const d = document.createElement('span');
      d.className = `d d${i}`;
      dots.appendChild(d);
    }

    const check = document.createElement('span');
    check.className = 'check';
    check.innerHTML = CHECK_SVG;

    this.labelEl = document.createElement('span');
    this.labelEl.className = 'label';
    this.labelEl.textContent = LABELS.idle;

    const stopBtn = document.createElement('button');
    stopBtn.className = 'stop-btn';
    stopBtn.type = 'button';
    stopBtn.textContent = '×';
    stopBtn.setAttribute('aria-label', 'Stop recording');

    content.appendChild(dot);
    content.appendChild(dots);
    content.appendChild(check);
    content.appendChild(this.labelEl);
    content.appendChild(stopBtn);
    this.el.appendChild(content);
    this.root.appendChild(this.el);

    // Prevent the bubble from stealing focus from the page input.
    this.el.addEventListener('mousedown', (e) => e.preventDefault());

    // Idle pill click → request recording.
    this.el.addEventListener('click', (e) => {
      if (!this.el) return;
      if (e.target === stopBtn || stopBtn.contains(e.target as Node)) return;
      if (this.el.classList.contains('idle')) {
        this.onRecordRequest?.();
      }
    });

    // Keyboard activation for the idle pill — Space is the page hotkey, so
    // only Enter triggers click-mode here.
    this.el.addEventListener('keydown', (e) => {
      if (!this.el) return;
      if (e.key !== 'Enter') return;
      if (this.el.classList.contains('idle')) {
        e.preventDefault();
        this.onRecordRequest?.();
      }
    });

    // Stop button click → request stop.
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onStopRequest?.();
    });
  }

  setState(state: BubbleState, message?: string): void {
    this.ensure();
    if (!this.el || !this.labelEl) return;

    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }

    this.el.className = `bubble ${state}`;
    this.labelEl.textContent = message ?? LABELS[state];
    this.el.setAttribute('aria-label', message ?? (LABELS[state] || 'Start dictation'));

    if (state === 'error') {
      this.revertTimer = window.setTimeout(() => this.setState('idle'), 2000);
    } else if (state === 'success') {
      this.revertTimer = window.setTimeout(() => this.setState('idle'), 1000);
    }
  }

  init(): void {
    this.setState('idle');
  }
}

export const bubble = new Bubble();
