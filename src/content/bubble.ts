export type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const TAG = 'sti-bubble';
const HOST_ID = 'speech-to-input-bubble-host';

interface BubbleElement extends HTMLElement {
  state?: BubbleState;
  message?: string;
}

// On some pages (sandboxed iframes, certain blob:/data: contexts, a handful of
// chrome-internal surfaces) the customElements registry is null. The Svelte
// compiled component calls customElements.define() at module-load time, so we
// import it lazily and guard the call. Failure here disables the visual bubble
// on that page; recording, transcription, and text insertion still work.
class Bubble {
  private el: BubbleElement | null = null;
  private revertTimer: number | null = null;
  private registered = false;
  private registrationAttempted = false;
  private pending: { state: BubbleState; message?: string } | null = null;

  onRecordRequest: (() => void) | null = null;
  onStopRequest: (() => void) | null = null;

  private async register(): Promise<boolean> {
    if (this.registered) return true;
    if (this.registrationAttempted) return this.registered;
    this.registrationAttempted = true;
    if (typeof customElements === 'undefined' || !customElements) {
      console.warn('[speech-to-input] customElements unavailable on this page; bubble disabled');
      return false;
    }
    try {
      await import('./Bubble.svelte');
      this.registered = true;
      return true;
    } catch (err) {
      console.warn('[speech-to-input] bubble registration failed', err);
      return false;
    }
  }

  private mount(): void {
    if (!this.registered) return;
    if (this.el && this.el.isConnected) return;
    this.el = document.createElement(TAG) as BubbleElement;
    this.el.id = HOST_ID;
    document.documentElement.appendChild(this.el);
    this.el.addEventListener('record-request', () => this.onRecordRequest?.());
    this.el.addEventListener('stop-request', () => this.onStopRequest?.());
  }

  private apply(state: BubbleState, message: string | undefined): void {
    if (!this.el) return;
    this.el.state = state;
    this.el.message = message ?? '';
  }

  setState(state: BubbleState, message?: string): void {
    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }
    if (state === 'error') {
      this.revertTimer = window.setTimeout(() => this.setState('idle'), 2000);
    } else if (state === 'success') {
      this.revertTimer = window.setTimeout(() => this.setState('idle'), 1000);
    }

    if (this.registered) {
      this.mount();
      this.apply(state, message);
      return;
    }

    // Not yet registered — remember the latest state and try to register.
    this.pending = { state, message };
    void this.register().then((ok) => {
      if (!ok || !this.pending) return;
      this.mount();
      this.apply(this.pending.state, this.pending.message);
      this.pending = null;
    });
  }

  init(): void {
    this.setState('idle');
  }
}

export const bubble = new Bubble();
