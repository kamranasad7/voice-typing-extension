import { bubble } from './bubble';
import { isWritableTarget, writeToTarget } from './inputWriter';
import type { ExtensionMessage, RecordingErrorReason } from '../shared/messages';

const HOTKEY = {
  code: 'Space',
  ctrl: true,
  shift: true,
  alt: false,
  meta: false,
} as const;

// Ignore presses shorter than this — likely accidental taps, not intentional holds.
const MIN_HOLD_MS = 150;

type RecordingMode = 'hotkey' | 'click';

let isRecording = false;
let pressedAt = 0;
let capturedTarget: Element | null = null;
let recordingMode: RecordingMode | null = null;
let lastFocusedTarget: Element | null = null;

function matchesHotkey(e: KeyboardEvent): boolean {
  return (
    e.code === HOTKEY.code &&
    e.ctrlKey === HOTKEY.ctrl &&
    e.shiftKey === HOTKEY.shift &&
    e.altKey === HOTKEY.alt &&
    e.metaKey === HOTKEY.meta
  );
}

function resolveTarget(): Element | null {
  const active = document.activeElement;
  if (isWritableTarget(active)) return active;
  if (lastFocusedTarget && lastFocusedTarget.isConnected && isWritableTarget(lastFocusedTarget)) {
    return lastFocusedTarget;
  }
  return null;
}

async function startRecording(mode: RecordingMode): Promise<void> {
  if (isRecording) return;
  capturedTarget = resolveTarget();
  if (!capturedTarget) {
    showError('no_active_input');
    return;
  }
  isRecording = true;
  recordingMode = mode;
  pressedAt = performance.now();
  bubble.setState('listening');

  try {
    await chrome.runtime.sendMessage({ type: 'START_RECORDING' } satisfies ExtensionMessage);
  } catch (err) {
    isRecording = false;
    recordingMode = null;
    showError('unknown', errorMessage(err));
  }
}

async function stopRecording(cancelled: boolean): Promise<void> {
  if (!isRecording) return;
  const mode = recordingMode;
  isRecording = false;
  recordingMode = null;

  // Min-hold debounce only applies to hotkey mode — click stops are always intentional.
  const tooShort = mode === 'hotkey' && performance.now() - pressedAt < MIN_HOLD_MS;
  if (cancelled || tooShort) {
    bubble.setState('idle');
    try {
      await chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' } satisfies ExtensionMessage);
    } catch {
      /* ignore */
    }
    return;
  }

  bubble.setState('processing');
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' } satisfies ExtensionMessage);
  } catch (err) {
    showError('unknown', errorMessage(err));
  }
}

function handleResult(text: string): void {
  // Empty text means silence — return to idle without writing or showing an error.
  if (text === '') {
    bubble.setState('idle');
    return;
  }
  if (!capturedTarget || !capturedTarget.isConnected) {
    showError('no_active_input', 'Input field is gone');
    return;
  }
  const written = writeToTarget(capturedTarget, text);
  if (!written) {
    showError('no_active_input', 'Could not write to field');
    return;
  }
  // Brief success confirmation — auto-reverts to idle after 1s.
  bubble.setState('success');
}

function showError(reason: RecordingErrorReason, message?: string): void {
  bubble.setState('error', labelForReason(reason));
  if (message) console.warn('[speech-to-input]', reason, message);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

console.log('[speech-to-input] content script loaded');
bubble.init();

bubble.onRecordRequest = () => {
  if (isRecording) return;
  void startRecording('click');
};
bubble.onStopRequest = () => {
  if (!isRecording) return;
  void stopRecording(false);
};

// Remember the most recent writable input that had focus, so click-mode can
// dictate into it even if the click on the Record pill steals focus.
document.addEventListener(
  'focusin',
  (e) => {
    const t = e.target as Element | null;
    if (isWritableTarget(t)) lastFocusedTarget = t;
  },
  true
);

document.addEventListener(
  'keydown',
  (e) => {
    if (!matchesHotkey(e)) return;
    if (e.repeat) return;
    console.log('[speech-to-input] hotkey pressed');
    e.preventDefault();
    void startRecording('hotkey');
  },
  true
);

document.addEventListener(
  'keyup',
  (e) => {
    if (e.code !== HOTKEY.code && e.key !== 'Control' && e.key !== 'Shift') return;
    if (!isRecording) return;
    // Only end the recording on key release if it was started by the hotkey.
    if (recordingMode !== 'hotkey') return;
    e.preventDefault();
    void stopRecording(false);
  },
  true
);

window.addEventListener(
  'blur',
  () => {
    if (isRecording) void stopRecording(true);
  },
  true
);

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as ExtensionMessage;
  if (msg.type === 'TRANSCRIPTION_RESULT') {
    handleResult(msg.text);
  } else if (msg.type === 'RECORDING_ERROR') {
    // Prefer the friendly label for known reasons; raw browser strings like
    // "Permission dismissed" are not actionable to the user.
    showError(msg.reason, msg.message);
  }
  sendResponse?.(undefined);
  return false;
});

function labelForReason(reason: RecordingErrorReason): string {
  switch (reason) {
    case 'mic_denied':
      return 'Mic blocked — open extension Options to grant access';
    case 'mic_unavailable':
      return 'Mic unavailable — open extension Options to set up';
    case 'no_active_input':
      return 'No input focused';
    case 'transcription_failed':
      return 'Transcription failed';
    default:
      return 'Something went wrong';
  }
}
