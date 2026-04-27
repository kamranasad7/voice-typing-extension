import type { RecordingErrorReason } from '../shared/messages';
import { errorMessage } from '../shared/util';

const LOG = '[speech-to-input/offscreen]';

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
  const localRecorder = mimeType
    ? new MediaRecorder(mediaStream, { mimeType })
    : new MediaRecorder(mediaStream);
  recorder = localRecorder;

  localRecorder.addEventListener('dataavailable', (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });

  const onStop = () => {
    const silent = peakAmplitude < SILENCE_THRESHOLD;
    const recordedMimeType = localRecorder.mimeType || 'audio/webm';
    const wasCancelled = cancelled;
    const collected = chunks;
    cleanup();
    if (wasCancelled) return;
    if (collected.length === 0) {
      void chrome.runtime.sendMessage({
        type: 'AUDIO_READY',
        audio: null,
        mimeType: 'audio/wav',
        silent: true,
      });
      return;
    }
    // The transcription API expects WAV (or OGG); MediaRecorder produces WebM
    // on Chrome. Decode → resample to 16 kHz mono → encode WAV here so the
    // background only ever sees a payload the API can ingest.
    void (async () => {
      try {
        const blob = new Blob(collected, { type: recordedMimeType });
        const wav = await blobToWavBuffer(blob);
        if (!wav) {
          // Audio was empty or under Whisper's ~100 ms minimum — treat as silent
          // so the bubble returns to idle without a user-visible error and we
          // skip an API call that would just rebound with "no audio track found".
          chrome.runtime.sendMessage({
            type: 'AUDIO_READY',
            audio: null,
            mimeType: 'audio/wav',
            silent: true,
          });
          return;
        }
        chrome.runtime.sendMessage({
          type: 'AUDIO_READY',
          audio: wav,
          mimeType: 'audio/wav',
          silent,
        });
      } catch (err) {
        sendError('unknown', `audio conversion failed: ${errorMessage(err)}`);
      }
    })();
  };

  localRecorder.addEventListener('stop', onStop);

  localRecorder.addEventListener('error', (e) => {
    // Detach 'stop' so the trailing event (which fires after error per spec)
    // doesn't try to ship a half-baked buffer once cleanup() has run.
    localRecorder.removeEventListener('stop', onStop);
    sendError('unknown', `Recorder error: ${(e as ErrorEvent).message ?? 'unknown'}`);
    cleanup();
  });

  localRecorder.start();
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
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

// 16 kHz mono PCM is what Whisper uses natively. Resampling here keeps the
// payload small (~32 KB/s) and matches the model's expected input rate.
const TARGET_SAMPLE_RATE = 16000;
// Whisper's documented minimum clip length is ~100 ms; below that the API
// rejects with "no audio track found in file" after a wasted round trip.
const MIN_SAMPLES = TARGET_SAMPLE_RATE / 10;

async function blobToWavBuffer(blob: Blob): Promise<ArrayBuffer | null> {
  const ac = new AudioContext();
  try {
    const inputBuffer = await blob.arrayBuffer();
    const decoded = await ac.decodeAudioData(inputBuffer);
    if (decoded.length === 0) return null;
    const resampled = await downmixAndResample(decoded, TARGET_SAMPLE_RATE);
    if (resampled.length < MIN_SAMPLES) {
      console.log(LOG, 'audio too short for transcription', resampled.length, 'samples');
      return null;
    }
    return audioBufferToWav(resampled);
  } finally {
    void ac.close().catch(() => { /* ignore */ });
  }
}

async function downmixAndResample(buf: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  if (buf.sampleRate === targetRate && buf.numberOfChannels === 1) return buf;
  const length = Math.max(1, Math.ceil(buf.duration * targetRate));
  const offline = new OfflineAudioContext({
    numberOfChannels: 1,
    length,
    sampleRate: targetRate,
  });
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();
  return offline.startRendering();
}

function audioBufferToWav(buf: AudioBuffer): ArrayBuffer {
  const channels = 1;
  const sampleRate = buf.sampleRate;
  const samples = buf.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const totalSize = 44 + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return ab;
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function sendError(reason: RecordingErrorReason, message: string): void {
  void chrome.runtime.sendMessage({ type: 'OFFSCREEN_ERROR', reason, message });
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
