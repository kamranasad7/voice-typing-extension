import './Bubble.svelte';

export type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const TAG = 'sti-bubble';
const HOST_ID = 'speech-to-input-bubble-host';

interface BubbleElement extends HTMLElement {
  state?: BubbleState;
  message?: string;
}

class Bubble {
  private el: BubbleElement | null = null;
  private revertTimer: number | null = null;

  onRecordRequest: (() => void) | null = null;
  onStopRequest: (() => void) | null = null;

  private ensure(): void {
    if (this.el && this.el.isConnected) return;
    this.el = document.createElement(TAG) as BubbleElement;
    this.el.id = HOST_ID;
    document.documentElement.appendChild(this.el);
    this.el.addEventListener('record-request', () => this.onRecordRequest?.());
    this.el.addEventListener('stop-request', () => this.onStopRequest?.());
  }

  setState(state: BubbleState, message?: string): void {
    this.ensure();
    if (!this.el) return;

    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }

    this.el.state = state;
    this.el.message = message ?? '';

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
