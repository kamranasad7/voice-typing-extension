const CANNED_RESPONSES = [
  'Hello world, this is a test transcription.',
  'The quick brown fox jumps over the lazy dog.',
  'Speech to text is working as expected.',
  'This text was inserted by the extension.',
  'Replace this stub with a real transcription API.',
];

// NOTE: when wiring a real API, remember that Blob does not survive
// chrome.runtime.sendMessage serialization. The offscreen document must
// convert the recording to an ArrayBuffer (or base64) before sending it
// to the background, then reconstruct it here.
export async function dummyTranscribe(_audio: Blob | null, silent: boolean): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (silent) return '';
  const index = Math.floor(Math.random() * CANNED_RESPONSES.length);
  return CANNED_RESPONSES[index]!;
}
