import type { ExtensionMessage, RecordingErrorReason } from '../shared/messages';
import { dummyTranscribe } from '../shared/dummyTranscribe';

const OFFSCREEN_PATH = 'src/offscreen/index.html';

// Tracks the tab that initiated the current recording so we can route results back.
let activeTabId: number | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [offscreenUrl],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Capture microphone audio for speech-to-text transcription.',
  });
}

async function closeOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [offscreenUrl],
  });
  if (existing.length === 0) return;
  await chrome.offscreen.closeDocument();
}

async function sendToTab(tabId: number, message: ExtensionMessage): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    console.warn('[bg] failed to send message to tab', tabId, err);
  }
}

async function sendToOffscreen(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

async function handleStartRecording(tabId: number): Promise<void> {
  console.log('[bg] START_RECORDING received from tab', tabId);
  if (activeTabId !== null && activeTabId !== tabId) {
    // Another tab already owns the mic — reject this start cleanly so the
    // requesting bubble drops back to idle instead of hanging.
    await reportError(tabId, 'mic_unavailable', 'Recording already active in another tab');
    return;
  }
  activeTabId = tabId;
  try {
    await ensureOffscreenDocument();
    console.log('[bg] offscreen ready, forwarding START');
    await sendToOffscreen({ type: 'START_RECORDING' });
  } catch (err) {
    console.error('[bg] start recording failed', err);
    await reportError(tabId, 'mic_unavailable', errorMessage(err));
    activeTabId = null;
  }
}

async function handleStopRecording(senderTabId: number | undefined): Promise<void> {
  if (activeTabId === null) return;
  if (senderTabId !== undefined && senderTabId !== activeTabId) return;
  const tabId = activeTabId;
  try {
    // Offscreen will reply via runtime.sendMessage with 'TRANSCRIPTION_RESULT' or 'RECORDING_ERROR'
    await sendToOffscreen({ type: 'STOP_RECORDING' });
  } catch (err) {
    console.error('[bg] stop recording failed', err);
    await reportError(tabId, 'unknown', errorMessage(err));
    activeTabId = null;
  }
}

async function handleCancelRecording(senderTabId: number | undefined): Promise<void> {
  if (activeTabId !== null && senderTabId !== undefined && senderTabId !== activeTabId) return;
  try {
    await sendToOffscreen({ type: 'CANCEL_RECORDING' });
  } catch {
    /* ignore */
  }
  activeTabId = null;
}

async function handleAudioFromOffscreen(
  audio: ArrayBuffer | null,
  mimeType: string,
  silent: boolean
): Promise<void> {
  if (activeTabId === null) return;
  const tabId = activeTabId;
  try {
    const blob = audio ? new Blob([audio], { type: mimeType }) : null;
    const text = await dummyTranscribe(blob, silent);
    await sendToTab(tabId, { type: 'TRANSCRIPTION_RESULT', text });
  } catch (err) {
    await reportError(tabId, 'transcription_failed', errorMessage(err));
  } finally {
    activeTabId = null;
  }
}

async function reportError(
  tabId: number,
  reason: RecordingErrorReason,
  message?: string
): Promise<void> {
  await sendToTab(tabId, { type: 'RECORDING_ERROR', reason, message });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type RoutedMessage = ExtensionMessage & { target?: 'offscreen' | 'background' };
type AudioReadyMessage = {
  type: 'AUDIO_READY';
  audio: ArrayBuffer | null;
  mimeType: string;
  silent: boolean;
};
type OffscreenError = {
  type: 'OFFSCREEN_ERROR';
  reason: RecordingErrorReason;
  message?: string;
};
type IncomingMessage = RoutedMessage | AudioReadyMessage | OffscreenError;

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const msg = raw as IncomingMessage;

  // Messages targeted at the offscreen document are not for us.
  if ('target' in msg && msg.target === 'offscreen') return false;

  if (msg.type === 'START_RECORDING' && sender.tab?.id !== undefined) {
    void handleStartRecording(sender.tab.id);
    sendResponse(undefined);
    return false;
  }
  if (msg.type === 'STOP_RECORDING') {
    void handleStopRecording(sender.tab?.id);
    sendResponse(undefined);
    return false;
  }
  if (msg.type === 'CANCEL_RECORDING') {
    void handleCancelRecording(sender.tab?.id);
    sendResponse(undefined);
    return false;
  }
  if (msg.type === 'AUDIO_READY') {
    void handleAudioFromOffscreen(msg.audio, msg.mimeType, msg.silent);
    sendResponse(undefined);
    return false;
  }
  if (msg.type === 'OFFSCREEN_ERROR') {
    if (activeTabId !== null) {
      void reportError(activeTabId, msg.reason, msg.message);
      activeTabId = null;
    }
    sendResponse(undefined);
    return false;
  }
  return false;
});

self.addEventListener('install', (event) => {
  // Eagerly tear down any leftover offscreen document on extension reload.
  (event as Event & { waitUntil: (p: Promise<unknown>) => void }).waitUntil(
    closeOffscreenDocument()
  );
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});
