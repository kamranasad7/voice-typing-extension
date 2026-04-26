<script lang="ts">
  type StatusKind = '' | 'ok' | 'err';

  let buttonDisabled = $state(false);
  let statusText = $state('');
  let statusKind = $state<StatusKind>('');

  async function checkExisting(): Promise<void> {
    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      if (result.state === 'granted') {
        showOk('Microphone access already granted. You can close this tab.');
        buttonDisabled = true;
      }
    } catch {
      /* permissions.query for microphone not supported in some Chrome versions — ignore */
    }
  }

  async function requestPermission(): Promise<void> {
    buttonDisabled = true;
    statusText = 'Waiting for permission…';
    statusKind = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release the mic — we just wanted to trigger the permission prompt.
      for (const track of stream.getTracks()) track.stop();
      showOk('Microphone access granted. You can close this tab and start using the hotkey.');
    } catch (err) {
      buttonDisabled = false;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showErr(
          'Permission was denied. Click the button again and choose "Allow", or click the camera/mic icon in the address bar to change it.'
        );
      } else {
        showErr(
          'Could not access microphone: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }

  function showOk(text: string): void {
    statusText = text;
    statusKind = 'ok';
  }
  function showErr(text: string): void {
    statusText = text;
    statusKind = 'err';
  }

  $effect(() => {
    void checkExisting();
  });
</script>

<h1>Speech to Input</h1>
<p class="sub">One-time setup before the extension can use your microphone.</p>

<div class="step">
  <h2>1. Grant microphone access</h2>
  <p>
    Click the button below and allow microphone access when Chrome prompts you. This permission is
    granted to the extension and persists across browser restarts.
  </p>
  <button onclick={requestPermission} disabled={buttonDisabled}>Grant microphone access</button>
  <div class="status {statusKind}">{statusText}</div>
</div>

<div class="step">
  <h2>2. Use the extension</h2>
  <p>
    Focus any text input on a page, then hold <kbd>Ctrl</kbd> + <kbd>Shift</kbd> +
    <kbd>Space</kbd>. A bubble appears at the bottom of the screen while you speak. Release the
    keys to insert the transcribed text.
  </p>
</div>

<style>
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; margin-bottom: 28px; }
  .step {
    border: 1px solid rgba(127, 127, 127, 0.25);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 14px;
  }
  .step h2 { font-size: 15px; margin: 0 0 8px; }
  button {
    font-size: 14px;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    background: #2563eb;
    color: white;
    cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .status { margin-top: 10px; font-size: 13px; }
  .status.ok { color: #16a34a; }
  .status.err { color: #dc2626; }
  kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: rgba(127, 127, 127, 0.18);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 12px;
  }
</style>
