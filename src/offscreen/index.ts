import type { RecordingErrorReason } from '../shared/messages';

type RoutedMessage =
  | { type: 'START_RECORDING'; target: 'offscreen' }
  | { type: 'STOP_RECORDING'; target: 'offscreen' }
  | { type: 'CANCEL_RECORDING'; target: 'offscreen' };

// Peak normalized amplitude under this is treated as silence.
// ~-34 dBFS — sits above typical room noise (~0.002–0.01) but below normal
// speech (~0.1+). Whispered speech still clears it.
const SILENCE_THRESHOLD = 0.02;
const POLL_INTERVAL_MS = 50;

let mediaStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let cancelled = false;
let starting = false;
let cancelDuringStart = false;

let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let pollTimer: number | null = null;
let peakAmplitude = 0;

async function startRecording(): Promise<void> {
  if (recorder || starting) return;
  starting = true;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    starting = false;
    const reason: RecordingErrorReason =
      err instanceof DOMException && err.name === 'NotAllowedError' ? 'mic_denied' : 'mic_unavailable';
    sendError(reason, errorMessage(err));
    return;
  }

  if (cancelDuringStart) {
    for (const track of stream.getTracks()) track.stop();
    starting = false;
    cancelDuringStart = false;
    return;
  }

  mediaStream = stream;
  startAmplitudeMonitor(mediaStream);

  const mimeType = pickSupportedMimeType();
  recorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);

  recorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  recorder.addEventListener('stop', () => {
    const silent = peakAmplitude < SILENCE_THRESHOLD;
    const mimeType = recorder?.mimeType ?? 'audio/webm';
    const wasCancelled = cancelled;
    const collected = chunks;
    cleanup();
    if (wasCancelled) return;
    if (collected.length === 0) {
      void chrome.runtime.sendMessage({ type: 'AUDIO_READY', audio: null, mimeType, silent });
      return;
    }
    // Blob is not structured-cloneable across runtime.sendMessage — convert to
    // ArrayBuffer so the bytes actually arrive at the background worker.
    void new Blob(collected, { type: mimeType }).arrayBuffer().then((buf) => {
      chrome.runtime.sendMessage({ type: 'AUDIO_READY', audio: buf, mimeType, silent });
    });
  });

  recorder.addEventListener('error', (e) => {
    // Mark cancelled so the trailing 'stop' event (which still fires after
    // cleanup) doesn't try to ship a half-baked buffer to the background.
    cancelled = true;
    sendError('unknown', `Recorder error: ${(e as ErrorEvent).message ?? 'unknown'}`);
    cleanup();
  });

  recorder.start();
  starting = false;
}

function stopRecording(cancel: boolean): void {
  if (starting) {
    // getUserMedia is still resolving — defer the decision to the start path.
    if (cancel) cancelDuringStart = true;
    return;
  }
  if (!recorder) {
    // STOP arrived but recording never started (likely a getUserMedia failure
    // already reported). Tell the background to clear the active state so the
    // bubble doesn't spin forever.
    if (!cancel) sendError('mic_unavailable', 'Recording was not active');
    return;
  }
  cancelled = cancel;
  if (recorder.state !== 'inactive') recorder.stop();
}

function startAmplitudeMonitor(stream: MediaStream): void {
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  sourceNode.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  pollTimer = window.setInterval(() => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buffer);
    let localPeak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(buffer[i]!);
      if (v > localPeak) localPeak = v;
    }
    if (localPeak > peakAmplitude) peakAmplitude = localPeak;
  }, POLL_INTERVAL_MS);
}

function cleanup(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch { /* already disconnected */ }
    sourceNode = null;
  }
  analyser = null;
  if (audioContext) {
    void audioContext.close().catch(() => { /* ignore */ });
    audioContext = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = null;
  }
  recorder = null;
  chunks = [];
  peakAmplitude = 0;
  cancelled = false;
  cancelDuringStart = false;
  starting = false;
}

function pickSupportedMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function sendError(reason: RecordingErrorReason, message: string): void {
  void chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', reason, message });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as RoutedMessage;
  if (!('target' in msg) || msg.target !== 'offscreen') return false;

  if (msg.type === 'START_RECORDING') {
    void startRecording();
  } else if (msg.type === 'STOP_RECORDING') {
    stopRecording(false);
  } else if (msg.type === 'CANCEL_RECORDING') {
    stopRecording(true);
  }

  sendResponse(undefined);
  return false;
});
