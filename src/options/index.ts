const button = document.getElementById('grant') as HTMLButtonElement;
const statusEl = document.getElementById('statusEl') as HTMLDivElement;

async function checkExistingPermission(): Promise<void> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (result.state === 'granted') {
      showOk('Microphone access already granted. You can close this tab.');
      button.disabled = true;
    }
  } catch {
    /* permissions.query for microphone not supported in some Chrome versions — ignore */
  }
}

async function requestPermission(): Promise<void> {
  button.disabled = true;
  statusEl.textContent = 'Waiting for permission…';
  statusEl.className = 'statusEl';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Immediately release the mic — we just wanted to trigger the permission prompt.
    for (const track of stream.getTracks()) track.stop();
    showOk('Microphone access granted. You can close this tab and start using the hotkey.');
  } catch (err) {
    button.disabled = false;
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      showErr('Permission was denied. Click the button again and choose "Allow", or click the camera/mic icon in the address bar to change it.');
    } else {
      showErr('Could not access microphone: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
}

function showOk(text: string): void {
  statusEl.textContent = text;
  statusEl.className = 'statusEl ok';
}

function showErr(text: string): void {
  statusEl.textContent = text;
  statusEl.className = 'statusEl err';
}

button.addEventListener('click', () => {
  void requestPermission();
});

void checkExistingPermission();
