import { mount } from 'svelte';
import BubbleComponent from './Bubble.svelte';
import bubbleStyles from './Bubble.css?inline';

export type BubbleState = 'idle' | 'listening' | 'processing' | 'success' | 'error';

const HOST_ID = 'speech-to-input-bubble-host';

interface BubbleApi {
  setState(state: BubbleState, message?: string): void;
}

class Bubble {
  private host: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;
  private api: BubbleApi | null = null;
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

    const styleEl = document.createElement('style');
    styleEl.textContent = bubbleStyles;
    this.root.appendChild(styleEl);

    const target = document.createElement('div');
    this.root.appendChild(target);

    mount(BubbleComponent, {
      target,
      props: {
        onRecord: () => this.onRecordRequest?.(),
        onStop: () => this.onStopRequest?.(),
        register: (api: BubbleApi) => {
          this.api = api;
        },
      },
    });
  }

  setState(state: BubbleState, message?: string): void {
    this.ensure();

    if (this.revertTimer !== null) {
      clearTimeout(this.revertTimer);
      this.revertTimer = null;
    }

    this.api?.setState(state, message);

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
