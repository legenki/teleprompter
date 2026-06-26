# Chrome Extension — Side Panel Design

**Date:** 2026-06-26  
**Status:** Approved

## Goal

Convert the existing browser-based teleprompter into a Chrome Extension that runs as a Side Panel, available on any page. Users can also open a full-screen tab from the sidebar.

## Constraints

- Chrome only (Manifest V3)
- Remote Control removed from the extension (stays in the web version)
- Drafts are isolated: extension uses its own storage, not shared with the web version
- No new bundler in the existing codebase today → Vite is introduced

---

## 1. Repository Structure

Monorepo with two build targets sharing a common core:

```
teleprompter/
├── src/                        # shared core (moved from assets/js/)
│   ├── core/
│   │   ├── store.js            # unchanged
│   │   ├── teleprompter.js     # unchanged
│   │   ├── timer.js            # unchanged
│   │   ├── colors.js           # unchanged
│   │   └── config.js           # unchanged
│   ├── ui/
│   │   └── ui.js               # unchanged
│   └── styles/
│       └── app.css             # unchanged
│
├── web/                        # web build target
│   ├── index.html              # adapted (paths → src/)
│   ├── remote.html
│   └── app.js                  # entry point (current assets/js/app.js)
│
├── extension/                  # Chrome extension build target
│   ├── manifest.json           # Manifest V3
│   ├── sidebar.html            # side panel entry point
│   ├── sidebar.js              # JS entry (imports from src/core/)
│   ├── sidebar.css             # layout overrides for narrow sidebar
│   ├── fullscreen.html         # full-screen tab entry point
│   ├── fullscreen.js           # JS entry for full-screen tab
│   ├── store-adapter.js        # thin wrapper: localStorage → chrome.storage.local
│   ├── background.js           # MV3 service worker
│   └── icons/                  # 16/48/128px icons
│
├── vite.config.web.js          # builds → dist/web/
├── vite.config.ext.js          # builds → dist/extension/
├── package.json
└── server.js                   # unchanged
```

**Key decision:** all core modules (`store`, `teleprompter`, `timer`, `colors`, `config`) move to `src/core/` untouched. Both targets import from there. Vite builds each target with a separate config.

---

## 2. Build Scripts

```json
{
  "dev:web":   "vite --config vite.config.web.js",
  "dev:ext":   "vite build --config vite.config.ext.js --watch",
  "build:web": "vite build --config vite.config.web.js",
  "build:ext": "vite build --config vite.config.ext.js",
  "build":     "npm run build:web && npm run build:ext"
}
```

Output:
- `dist/web/` — deployable web version (replaces current root-level files)
- `dist/extension/` — loadable Chrome extension (Load unpacked → this folder)

---

## 3. Chrome Extension

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Teleprompter",
  "version": "1.0.0",
  "permissions": ["sidePanel", "storage", "tabs"],
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Open Teleprompter"
  }
}
```

### What works in the sidebar

- Text editing, scrolling, speed, font size
- Flip X/Y, dim-mode (reading focus)
- Drafts via `chrome.storage.local`
- Word count and timer

### What is removed in the extension

- Remote Control button and Socket.IO — hidden/not loaded
- PWA Service Worker registration — not applicable inside an extension
- Software update modal — not applicable

### store-adapter.js

`store.js` uses `localStorage` via `safeGet`/`safeSet`. The adapter wraps these two functions to redirect reads/writes to `chrome.storage.local`. `store.js` itself is not modified. The extension entry points import the adapter before importing store.

Note: `chrome.storage.local` is async; the adapter initialises state synchronously from a pre-loaded snapshot (fetched once at startup via `chrome.storage.local.get`) then writes back asynchronously on every change.

### Full-screen mode

A "maximise" icon button in the sidebar header calls:

```js
chrome.tabs.create({ url: chrome.runtime.getURL('fullscreen.html') });
```

`fullscreen.html` is identical to the web `index.html` but uses the same `chrome.storage.local` store. State (text, config, drafts) is already synchronised — opening the full-screen tab shows the same content that was in the sidebar.

---

## 4. UI Adaptation for the Sidebar

The sidebar is 300–400px wide. The current horizontal header does not fit.

### Header layout override (`sidebar.css`)

- **Row 1:** logo + timer + fullscreen button (right-aligned)
- **Row 2:** font-size slider + speed slider + control buttons (play, reset, flip X/Y, dim)
- Color pickers remain, compressed to icon-only
- Remote button removed

`sidebar.css` only overrides header layout — `app.css` is not modified.

### Teleprompter area

Unchanged. Fills remaining sidebar height, scrolls normally.

### Drafts panel

Slide-in panel opens over the sidebar content (same behaviour as web version). No change to logic.

---

## 5. What is NOT changing

- `store.js`, `teleprompter.js`, `timer.js`, `colors.js`, `config.js` — zero modifications
- `ui.js` — zero modifications  
- `app.css` — zero modifications
- `server.js` — zero modifications
- `remote.html` / remote feature — stays in web version only
