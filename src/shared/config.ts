export const TRANSCRIPTION_API_URL = 'https://transcription.tryverba.ai';

// SECURITY: This bypass header lets us skip auth during development. The
// secret WILL ship with any built extension and is trivially extractable
// from the distributed bundle. Before publishing this extension outside
// your team, replace getAuthHeaders() with a real bearer token (read from
// chrome.storage, populated by the email / Google sign-in flow) and
// delete DEV_BYPASS_SECRET. Single touchpoint by design.
const DEV_BYPASS_SECRET = 'VXJ7qPlLtz6L7skUhzngTjItfL2Ac9uBYhCtc6L/H6Y=';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  return { 'X-Bypass-Secret': DEV_BYPASS_SECRET };
}
