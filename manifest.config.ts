import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Speech to Input',
  version: '0.1.0',
  description:
    'Hold Ctrl+Shift+Space, speak, and the transcribed text is written into the active input field.',
  minimum_chrome_version: '116',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  permissions: ['offscreen'],
  host_permissions: ['<all_urls>'],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
});
