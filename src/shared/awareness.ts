// Active-tab awareness — exposes a single getAwareness() that works from any
// extension context. Content scripts read the surrounding document directly;
// background / offscreen / options pages query chrome.tabs.

export type Awareness = {
  title: string;
  url: string;
  hostname: string;
  iconUrl: string | null;
};

export async function getAwareness(): Promise<Awareness> {
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) return fromTab(tab);
    } catch {
      /* fall through to document-based fallback */
    }
  }
  return fromDocument();
}

function fromTab(tab: chrome.tabs.Tab): Awareness {
  const url = tab.url ?? '';
  return {
    title: tab.title ?? '',
    url,
    hostname: safeHostname(url),
    iconUrl: faviconApiUrl(url) ?? tab.favIconUrl ?? null,
  };
}

function fromDocument(): Awareness {
  const url = location.href;
  return {
    title: document.title,
    url,
    hostname: safeHostname(url),
    iconUrl: faviconApiUrl(url),
  };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// Chrome's _favicon extension API serves the cached favicon as a
// chrome-extension:// URL — sidesteps the page's CSP, which is why a plain
// <img src="https://site/favicon.ico"> often fails when injected by a content
// script. Requires the "favicon" permission and "_favicon/*" in
// web_accessible_resources (see manifest.config.ts).
function faviconApiUrl(pageUrl: string): string | null {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return null;
  if (!pageUrl) return null;
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', '32');
    return u.toString();
  } catch {
    return null;
  }
}
