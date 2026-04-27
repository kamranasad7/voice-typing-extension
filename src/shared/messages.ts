export type ExtensionMessage =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'CANCEL_RECORDING' }
  | { type: 'TRANSCRIPTION_RESULT'; text: string }
  | { type: 'RECORDING_ERROR'; reason: RecordingErrorReason; message?: string };

export type RecordingErrorReason =
  | 'mic_denied'
  | 'mic_unavailable'
  | 'no_active_input'
  | 'transcription_failed'
  | 'unknown';
