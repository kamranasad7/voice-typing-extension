# Speech to Input

Chromium browser extension. Hold a hotkey, speak, and the transcribed text is written into whichever input field is focused on the page. A bubble at the bottom-center of the page shows the current state (listening / processing / error).

> Speech-to-text is currently a **dummy stub** that returns canned text after a short delay. Swap [`src/shared/dummyTranscribe.ts`](src/shared/dummyTranscribe.ts) for a real API later.

## Hotkey

Hold **Ctrl + Shift + Space** to record. Release to send the audio for transcription. The transcribed text is inserted at the cursor position of the focused field.

## Tech stack

- Manifest V3
- TypeScript (strict)
- Vite + `@crxjs/vite-plugin`
- Native `MediaRecorder` in an offscreen document (mic access)
- Plain DOM + Shadow DOM for the on-page bubble (no UI framework)
- Zero runtime dependencies

## Develop

```bash
npm install
npm run dev
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the generated `dist/` folder
4. Visit any page with an input, focus it, hold the hotkey, speak

The first time you record, Chrome will prompt for microphone permission (granted to the offscreen document, persists thereafter).

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Project structure

```
src/
  background/    service worker — message router, owns offscreen lifecycle
  content/       injected on every page — hotkey, bubble, input writer
  offscreen/     hidden DOM page — getUserMedia + MediaRecorder
  shared/        message contract + dummy transcribe stub
```

## Known limitations

- Does not work inside `<iframe>` content (content script is top-frame only).
- Does not work on the Chrome PDF viewer or `chrome://` pages.
- Hotkey is hard-coded for now; an options page is planned.
