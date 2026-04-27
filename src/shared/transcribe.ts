import { TRANSCRIPTION_API_URL, getAuthHeaders } from './config';

interface TranscribeResult {
  text: string;
  audio_ms: number;
  timing: {
    auth_ms: number;
    upload_ms: number;
    groq_ms: number;
    total_ms: number;
  };
}

/**
 * POST WAV (or OGG) audio to the Verba transcription worker and return the
 * transcript. Returns '' when the recording is silent or empty so the caller
 * can no-op without raising an error to the user.
 */
const LOG = '[speech-to-input/transcribe]';

export async function transcribe(audio: Blob | null, silent: boolean): Promise<string> {
  if (silent || !audio || audio.size === 0) return '';

  const authHeaders = await getAuthHeaders();
  const contentType = audio.type || 'audio/wav';

  console.log(LOG, 'POST', { bytes: audio.size, contentType });

  let resp: Response;
  try {
    resp = await fetch(`${TRANSCRIPTION_API_URL}/transcribe`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': contentType },
      body: audio,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error: ${msg}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(LOG, 'response', resp.status, resp.statusText, body);
    throw new Error(`Transcription failed (${resp.status}): ${body || resp.statusText}`);
  }

  const result = (await resp.json()) as TranscribeResult;
  console.log(LOG, 'OK', {
    audio_ms: result.audio_ms,
    total_ms: result.timing.total_ms,
    groq_ms: result.timing.groq_ms,
  });
  return result.text;
}
