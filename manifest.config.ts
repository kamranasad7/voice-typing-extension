import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Speech to Input',
  version: '0.1.0',
  description:
    'Hold Ctrl+Shift+Space, speak, and the transcribed text is written into the active input field.',
  minimum_chrome_version: '116',
  icons: {
    16: 'src/assets/verba-logo-16.png',
    32: 'src/assets/verba-logo-32.png',
    48: 'src/assets/verba-logo-48.png',
    128: 'src/assets/verba-logo-128.png',
  },
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
  permissions: ['offscreen', 'favicon'],
  host_permissions: ['<all_urls>'],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  web_accessible_resources: [
    {
      // Lets the content-script bubble load chrome's cached favicon for the
      // current tab as a chrome-extension:// URL, bypassing page CSPs that
      // would otherwise block <img src="https://site/favicon.ico">.
      resources: ['_favicon/*'],
      matches: ['<all_urls>'],
    },
  ],
});
