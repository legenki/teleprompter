// Lets the extension's interview page run as a plain web page (GitHub Pages): the few chrome.* APIs it uses
// are backed by localStorage and page-relative URLs. There is no tabCapture, so the page uses in-page mode.
const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};

// Chrome pages already expose a `chrome` object (loadTimes/csi) that cannot be replaced, so extend it.
const api = window.chrome || (window.chrome = {});
Object.assign(api, {
  storage: {
    local: {
      async get(key) {
        const v = read(key);
        return v == null ? {} : { [key]: v };
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) {
          try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: settings just won't persist */ }
        }
      },
    },
  },
  runtime: {
    getURL: (path) => new URL(path, document.baseURI).href,
    onMessage: { addListener() {} },
    sendMessage: async () => undefined,
  },
});
