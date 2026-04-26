import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  vitePlugin: {
    // Only Bubble.svelte is compiled as a custom element (it mounts inside a
    // shadow root in the content script). Options.svelte is a regular component.
    dynamicCompileOptions: ({ filename }) => {
      if (filename && /Bubble\.svelte$/.test(filename)) {
        return { customElement: true };
      }
      return {};
    },
  },
};
