# Chrome Extension — Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the teleprompter into a Chrome Extension with a Side Panel that works on any page, plus a full-screen tab mode.

**Architecture:** Monorepo with two Vite build targets sharing a common `src/` core. The web target produces `dist/web/` (identical to current behaviour). The extension target produces `dist/extension/` (loadable via Chrome's "Load unpacked"). A thin `store-adapter.js` patches `localStorage` reads/writes to `chrome.storage.local` before any core module is imported.

**Tech Stack:** Vite 5, vanilla JS (ES6 modules), jQuery (bundled via npm), Chrome Extension Manifest V3 Side Panel API, `chrome.storage.local`.

---

## File Map

### Files moved (no content changes)
| From | To |
|---|---|
| `assets/js/store.js` | `src/core/store.js` |
| `assets/js/teleprompter.js` | `src/core/teleprompter.js` |
| `assets/js/timer.js` | `src/core/timer.js` |
| `assets/js/colors.js` | `src/core/colors.js` |
| `assets/js/config.js` | `src/core/config.js` |
| `assets/js/ui.js` | `src/ui/ui.js` |
| `assets/css/app.css` | `src/styles/app.css` |
| `assets/js/socket-client.js` | `src/web/socket-client.js` |
| `assets/js/remote-app.js` | `src/web/remote-app.js` |
| `assets/js/remote-socket.js` | `src/web/remote-socket.js` |
| `assets/js/remote-ui.js` | `src/web/remote-ui.js` |
| `assets/css/remote.css` | `src/web/remote.css` |

### Files created
| Path | Responsibility |
|---|---|
| `src/core/store.js` | (moved, unchanged) Central state + localStorage persistence |
| `web/app.js` | Web entry point — wires App class, imports socket-client |
| `web/index.html` | Web HTML — paths updated to src/ |
| `web/remote.html` | Web remote HTML |
| `extension/manifest.json` | MV3 manifest |
| `extension/background.js` | MV3 service worker — opens side panel on toolbar click |
| `extension/store-adapter.js` | Patches safeGet/safeSet → chrome.storage.local |
| `extension/sidebar.js` | Extension entry point — imports adapter then App (no socket) |
| `extension/sidebar.html` | Side panel HTML |
| `extension/sidebar.css` | Header layout overrides for narrow sidebar + fullscreen button |
| `extension/fullscreen.js` | Full-screen tab entry point |
| `extension/fullscreen.html` | Full-screen tab HTML |
| `extension/icons/` | 16/48/128px PNG icons (copied from assets/img/) |
| `vite.config.web.js` | Vite config for web target |
| `vite.config.ext.js` | Vite config for extension target |

### Files modified
| Path | Change |
|---|---|
| `package.json` | Add vite dev dep + build scripts |
| `.gitignore` | Add `dist/` |
| `assets/js/app.js` | (kept as-is for now, superseded by web/app.js) |

---

## Task 1: Install Vite and add build scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vite**

```bash
npm install --save-dev vite
```

Expected: `vite` appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Install jQuery as npm package** (vendor.js is currently a minified bundle; Vite will import it from npm instead)

```bash
npm install jquery
```

- [ ] **Step 3: Add build scripts to package.json**

Open `package.json` and add to the `"scripts"` section:

```json
"dev:web":   "vite --config vite.config.web.js",
"dev:ext":   "vite build --config vite.config.ext.js --watch",
"build:web": "vite build --config vite.config.web.js",
"build:ext": "vite build --config vite.config.ext.js",
"build":     "npm run build:web && npm run build:ext"
```

- [ ] **Step 4: Add dist/ to .gitignore**

Open `.gitignore` and add at the end:

```
dist/
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "build: add Vite and jQuery as npm deps"
```

---

## Task 2: Create src/ directory and move core files

**Files:**
- Create: `src/core/` (directory)
- Create: `src/ui/` (directory)
- Create: `src/styles/` (directory)
- Create: `src/web/` (directory)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/core src/ui src/styles src/web
```

- [ ] **Step 2: Copy core files to src/core/**

```bash
cp assets/js/store.js src/core/store.js
cp assets/js/teleprompter.js src/core/teleprompter.js
cp assets/js/timer.js src/core/timer.js
cp assets/js/colors.js src/core/colors.js
cp assets/js/config.js src/core/config.js
```

- [ ] **Step 3: Copy UI file to src/ui/**

```bash
cp assets/js/ui.js src/ui/ui.js
```

- [ ] **Step 4: Copy CSS to src/styles/**

```bash
cp assets/css/app.css src/styles/app.css
```

- [ ] **Step 5: Copy web-only files to src/web/**

```bash
cp assets/js/socket-client.js src/web/socket-client.js
cp assets/js/remote-app.js src/web/remote-app.js
cp assets/js/remote-socket.js src/web/remote-socket.js
cp assets/js/remote-ui.js src/web/remote-ui.js
cp assets/css/remote.css src/web/remote.css
```

- [ ] **Step 6: Fix import paths in all src/ files**

In `src/core/store.js` — imports reference `./config.js` which is correct (same directory). No change needed.

In `src/core/teleprompter.js` — change:
```js
// Before:
import { store } from './store.js';
// After: (already correct if in same dir)
import { store } from './store.js';
```
No path changes needed within `src/core/` — all core files import each other with `./` which stays valid.

In `src/ui/ui.js` — update imports to point up to core:
```js
// Before:
import { store } from './store.js';
import { Timer } from './timer.js';
import { paintRangeFill, applyAccent, applySurface } from './colors.js';
import { KEYS } from './config.js';

// After:
import { store } from '../core/store.js';
import { Timer } from '../core/timer.js';
import { paintRangeFill, applyAccent, applySurface } from '../core/colors.js';
import { KEYS } from '../core/config.js';
```

In `src/web/socket-client.js` — update:
```js
// Before:
import { store } from './store.js';
// After:
import { store } from '../core/store.js';
```

In `src/web/remote-app.js` — update:
```js
// Before:
import { store } from './store.js';
import { KEYS } from './config.js';
import { RemoteSocket } from './remote-socket.js';
import { RemoteUI } from './remote-ui.js';
// After:
import { store } from '../core/store.js';
import { KEYS } from '../core/config.js';
import { RemoteSocket } from './remote-socket.js';
import { RemoteUI } from './remote-ui.js';
```

In `src/web/remote-socket.js` — update imports from `./store.js` → `../core/store.js` and similar. (Read the file and fix any `./store`, `./config`, `./timer`, `./colors` references.)

In `src/web/remote-ui.js` — same: fix any `./store`, `./config` → `../core/`.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "refactor: move source files to src/ layout"
```

---

## Task 3: Create web entry point files

**Files:**
- Create: `web/app.js`
- Create: `web/index.html`
- Create: `web/remote.html`

- [ ] **Step 1: Create web/app.js**

This is identical to the current `assets/js/app.js` but with updated import paths:

```js
import { store } from '../src/core/store.js';
import { UI } from '../src/ui/ui.js';
import { Teleprompter } from '../src/core/teleprompter.js';
import { SocketClient } from '../src/web/socket-client.js';

class App {
  constructor() {
    this.ui = new UI();
    this.teleprompter = new Teleprompter(this.ui);
    this.socketClient = new SocketClient(this.ui, this.teleprompter);
  }

  init() {
    this.ui.init();
    this.teleprompter.init();
    this.socketClient.init();

    this.ui.$elm.buttonPlay.on('click.teleprompter', () => {
      if (!store.getState().isPlaying) {
        const countdownEnabled = store.getState().countdown;
        if (countdownEnabled) {
          this.teleprompter.runCountdown(() => this.teleprompter.start());
        } else {
          this.teleprompter.start();
        }
      } else {
        this.teleprompter.stop();
      }
    });

    this.ui.$elm.buttonReset.on('click.teleprompter', () => {
      this.teleprompter.reset();
    });

    this.ui.showSoftwareUpdate();

    const currentRemote = store.getState().remoteId;
    if (currentRemote && currentRemote.length === 6) {
      setTimeout(() => {
        this.socketClient.connect(currentRemote);
      }, 1000);
    }
  }
}

window.onload = () => {
  const app = new App();
  app.init();
};
```

- [ ] **Step 2: Create web/index.html**

Copy `index.html` from the root, then make these changes:
- Remove the `<script src="assets/js/vendor.js">` tag (jQuery now comes from npm via Vite)
- Change `<script type="module" src="assets/js/app.js">` → `<script type="module" src="./app.js">`
- Remove the Socket.IO detection `<script>` block — Vite will handle the conditional import
- Remove the Service Worker registration `<script>` block — not needed for the web build (can add back later as a Vite plugin)
- Keep all HTML structure (header, article, modal, drafts panel, countdown) identical

- [ ] **Step 3: Create web/remote.html**

Copy `remote.html` from the root as-is. Update script src paths to point to `src/web/remote-app.js`.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat: add web build entry points"
```

---

## Task 4: Create Vite configs

**Files:**
- Create: `vite.config.web.js`
- Create: `vite.config.ext.js`

- [ ] **Step 1: Create vite.config.web.js**

```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'web/index.html'),
        remote: resolve(__dirname, 'web/remote.html'),
      },
    },
  },
});
```

- [ ] **Step 2: Create vite.config.ext.js**

The extension build cannot use HTML entry points the same way — Chrome extensions need JS bundles, not Vite's HTML injection. Use `lib` mode with multiple entries:

```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar:    resolve(__dirname, 'extension/sidebar.js'),
        fullscreen: resolve(__dirname, 'extension/fullscreen.js'),
        background: resolve(__dirname, 'extension/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extmd]',
      },
    },
  },
});
```

- [ ] **Step 3: Verify web build runs**

```bash
npm run build:web
```

Expected: `dist/web/` created with `index.html` and assets. No errors.

If jQuery import fails (because ui.js uses `$` as a global), add to `vite.config.web.js`:

```js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'web',
  define: {
    // expose jQuery as $ and jQuery globals (ui.js uses $ directly)
  },
  plugins: [],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:   resolve(__dirname, 'web/index.html'),
        remote: resolve(__dirname, 'web/remote.html'),
      },
    },
  },
});
```

**Important:** `ui.js` uses `$` as a jQuery global (loaded via vendor.js previously). With Vite, import jQuery explicitly at the top of `web/app.js`:

```js
import $ from 'jquery';
import { store } from '../src/core/store.js';
// ... rest of imports
window.$ = window.jQuery = $;
```

This makes `$` available globally before ui.js runs.

- [ ] **Step 4: Commit**

```bash
git add vite.config.web.js vite.config.ext.js
git commit -m "build: add Vite configs for web and extension targets"
```

---

## Task 5: Create extension/store-adapter.js

**Files:**
- Create: `extension/store-adapter.js`

This is the most critical piece. `store.js` calls `safeGet(key, fallback)` and `safeSet(key, value)` internally. The adapter monkey-patches these onto `window` before `store.js` loads, so store.js picks them up.

However, since store.js defines `safeGet`/`safeSet` as private functions inside its own module scope, monkey-patching won't work directly. The clean approach: the adapter re-exports a patched version of the store module by intercepting at module level.

The correct implementation: **modify `src/core/store.js` minimally** to accept an optional storage backend, OR export `safeGet`/`safeSet` so the adapter can replace them.

The minimal change to `src/core/store.js`:

```js
// Add at top of src/core/store.js, before safeGet/safeSet definitions:
// Allow extension to inject a custom storage backend.
// Default is localStorage. Extension sets this before importing store.
let _storage = null;

function safeGet(key, fallback) {
  try {
    const store = _storage || localStorage;
    const v = store.getItem ? store.getItem(key) : null;
    return v === null ? fallback : v;
  } catch (e) { return fallback; }
}

function safeSet(key, value) {
  try {
    const store = _storage || localStorage;
    if (store.setItem) store.setItem(key, String(value));
    return true;
  } catch (e) { return false; }
}

export function setStorageBackend(backend) {
  _storage = backend;
}
```

Then `extension/store-adapter.js`:

```js
import { setStorageBackend } from '../src/core/store.js';

// Synchronous snapshot loaded once at startup (see sidebar.js for init flow)
let _snapshot = {};

const chromeStorage = {
  getItem(key) {
    const val = _snapshot[key];
    return val === undefined ? null : String(val);
  },
  setItem(key, value) {
    _snapshot[key] = String(value);
    // Fire-and-forget async write to chrome.storage.local
    chrome.storage.local.set({ [key]: String(value) });
  },
};

export async function initStorageAdapter() {
  // Load all keys at once before any store access
  _snapshot = await new Promise(resolve =>
    chrome.storage.local.get(null, resolve)
  );
  setStorageBackend(chromeStorage);
}
```

- [ ] **Step 1: Modify src/core/store.js to support pluggable storage**

Open `src/core/store.js`. Replace the existing `safeGet` and `safeSet` functions and add `setStorageBackend`:

```js
// Add this block at the very top of store.js, before safeGet/safeSet:
let _storage = null;

export function setStorageBackend(backend) {
  _storage = backend;
}

function safeGet(key, fallback) {
  try {
    const s = _storage || localStorage;
    const v = s.getItem(key);
    return v === null ? fallback : v;
  } catch (e) { return fallback; }
}

function safeSet(key, value) {
  try {
    const s = _storage || localStorage;
    s.setItem(key, String(value));
    return true;
  } catch (e) { return false; }
}
```

Remove the old `safeGet` and `safeSet` definitions (they are replaced by the above).

- [ ] **Step 2: Create extension/store-adapter.js**

```js
import { setStorageBackend } from '../src/core/store.js';

let _snapshot = {};

const chromeStorage = {
  getItem(key) {
    const val = _snapshot[key];
    return val === undefined ? null : String(val);
  },
  setItem(key, value) {
    _snapshot[key] = String(value);
    chrome.storage.local.set({ [key]: String(value) });
  },
};

export async function initStorageAdapter() {
  _snapshot = await new Promise(resolve =>
    chrome.storage.local.get(null, resolve)
  );
  setStorageBackend(chromeStorage);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/store.js extension/store-adapter.js
git commit -m "feat: add pluggable storage backend to store + chrome.storage adapter"
```

---

## Task 6: Create extension manifest and background service worker

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/icons/` (copy existing PNG icons)

- [ ] **Step 1: Create extension/manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Teleprompter",
  "version": "1.0.0",
  "description": "Browser-based teleprompter available in the Chrome sidebar.",
  "permissions": ["sidePanel", "storage", "tabs"],
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "Open Teleprompter",
    "default_icon": {
      "16":  "icons/icon-16.png",
      "48":  "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16":  "icons/icon-16.png",
    "48":  "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create extension/background.js**

```js
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
```

- [ ] **Step 3: Copy and resize icons**

The existing icons are 192×192 and larger. Chrome needs 16, 48, 128px. Copy the 192px icon and resize using ImageMagick (if available) or copy the same file for all sizes:

```bash
mkdir -p extension/icons
# If ImageMagick is installed:
convert assets/img/icon-192x192.png -resize 16x16 extension/icons/icon-16.png
convert assets/img/icon-192x192.png -resize 48x48 extension/icons/icon-48.png
convert assets/img/icon-192x192.png -resize 128x128 extension/icons/icon-128.png
```

If ImageMagick is not available, copy the 192px icon as a placeholder:

```bash
mkdir -p extension/icons
cp assets/img/icon-192x192.png extension/icons/icon-16.png
cp assets/img/icon-192x192.png extension/icons/icon-48.png
cp assets/img/icon-192x192.png extension/icons/icon-128.png
```

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json extension/background.js extension/icons/
git commit -m "feat: add extension manifest, background SW, and icons"
```

---

## Task 7: Create sidebar HTML and CSS

**Files:**
- Create: `extension/sidebar.html`
- Create: `extension/sidebar.css`

- [ ] **Step 1: Create extension/sidebar.html**

This is a stripped version of `index.html`. Remove: Socket.IO script block, Service Worker registration block, `vendor.js` script tag. Add `sidebar.css` link after `app.css`. Change the app script to `sidebar.js`. Add a fullscreen button to the header.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Teleprompter</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="../src/styles/app.css">
    <link rel="stylesheet" href="sidebar.css">
  </head>
  <body id="gui">
    <!-- Drafts panel -->
    <aside id="drafts-panel" class="drafts-panel" aria-hidden="true">
      <div class="drafts-header">
        <h2>Saved Scripts</h2>
        <button class="drafts-close" id="drafts-close" aria-label="Close" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="drafts-actions">
        <button class="drafts-btn primary" id="draft-save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Save Current
        </button>
        <button class="drafts-btn" id="draft-new">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New
        </button>
      </div>
      <ul class="drafts-list" id="drafts-list"></ul>
      <p class="drafts-empty" id="drafts-empty">No saved scripts yet.</p>
    </aside>
    <div id="drafts-backdrop" class="drafts-backdrop" hidden></div>

    <!-- Countdown overlay -->
    <div id="countdown" class="countdown" hidden aria-live="assertive">
      <div class="countdown-num">3</div>
    </div>

    <div id="modal">
      <a class="button close-modal" href="javascript:void(0)" role="button" aria-label="Close Modal" title="Close Modal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </a>
      <div class="modal-content">
        <div id="software-update" style="display:none">
          <h1>Software Update</h1>
          <p>A new version is available.</p>
        </div>
      </div>
      <div class="modal-overlay"></div>
    </div>

    <header>
      <h1>
        <svg class="logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 11l18-5v12L3 14v-3z"></path>
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>
        </svg>
        <span class="brand">Teleprompter</span>
        <span class="clock">00:00:00</span>
        <span class="stats" id="stats" aria-live="polite">
          <span class="stat-words"><span id="word-count">0</span> words</span>
          <span class="stat-sep">·</span>
          <span class="stat-time" id="reading-time">~0:00</span>
        </span>
      </h1>
      <nav>
        <div class="colors" role="group" aria-label="Color Pickers">
          <input type="color" id="text-color" value="#b3b33b" aria-label="Text Color" title="Text Color">
          <input type="color" id="background-color" value="#1f1610" aria-label="Background Color" title="Background Color">
        </div>
        <div class="sliders">
          <label class="font_size_label" aria-label="Font Size">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
            <span id="font-size-value">60</span>
            <input type="range" min="12" max="100" value="60" class="font_size slider" id="font-size-slider" aria-label="Font Size">
          </label>
          <label class="speed_label" aria-label="Page Speed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"></path><path d="m16.2 7.8 2.9-2.9"></path><path d="M18 12h4"></path><path d="m16.2 16.2 2.9 2.9"></path><circle cx="12" cy="14" r="8"></circle><path d="M12 14l3-3"></path></svg>
            <span id="speed-value">35</span>
            <input type="range" min="0" max="50" value="35" class="speed slider" id="speed-slider" aria-label="Page Speed">
          </label>
        </div>
        <div class="buttons" role="group" aria-label="Controls">
          <button class="theme-toggle" id="drafts-toggle" aria-label="Drafts" title="Saved Scripts" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
          </button>
          <!-- Fullscreen button — opens a new tab -->
          <button class="button small btn-fullscreen" id="btn-fullscreen" aria-label="Open Full Screen" title="Open Full Screen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          </button>
          <button class="button small btn-dim dim-controls" aria-label="Reading Focus" title="Reading Focus">
            <svg class="dim-on" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor"></circle></svg>
            <svg class="dim-off" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 3"></line></svg>
          </button>
          <button class="button small btn-reset reset" aria-label="Reset" title="Reset">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg>
          </button>
          <button class="button small btn-flipx flip-x" aria-label="Flip Horizontal" title="Flip Horizontal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"></path><path d="M16 7l4 5-4 5"></path><path d="M8 7l-4 5 4 5"></path></svg>
          </button>
          <button class="button small btn-flipy flip-y" aria-label="Flip Vertical" title="Flip Vertical">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"></path><path d="M7 8L12 4l5 4"></path><path d="M7 16l5 4 5-4"></path></svg>
          </button>
          <button class="button btn-play icon-play play active" aria-label="Play / Pause" title="Play / Pause">
            <svg class="play-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            <svg class="pause-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>
          </button>
        </div>
      </nav>
    </header>

    <article>
      <div class="overlay">
        <div class="top"></div>
        <div class="bottom"></div>
      </div>
      <div class="teleprompter" id="teleprompter" role="textbox" aria-multiline="true" aria-label="TelePrompter Text" contenteditable>
        Oh, hello there. Edit this text to get started.
      </div>
    </article>

    <script type="module" src="sidebar.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create extension/sidebar.css**

This overrides the header layout for narrow sidebar widths. Does not modify `app.css`.

```css
/* Sidebar layout — overrides app.css header for narrow sidebar */

header {
  flex-wrap: wrap;
  height: auto;
  padding: 8px 12px;
  gap: 6px;
}

header h1 {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

header h1 .brand {
  font-size: 13px;
}

header nav {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

header nav .sliders {
  display: flex;
  gap: 8px;
  width: 100%;
}

header nav .sliders label {
  flex: 1;
}

header nav .buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

header nav .colors {
  display: flex;
  gap: 6px;
}

/* Adjust article top padding to match taller header */
article {
  padding-top: 110px;
}
```

- [ ] **Step 3: Commit**

```bash
git add extension/sidebar.html extension/sidebar.css
git commit -m "feat: add sidebar HTML and CSS layout"
```

---

## Task 8: Create extension sidebar.js entry point

**Files:**
- Create: `extension/sidebar.js`

- [ ] **Step 1: Create extension/sidebar.js**

```js
import $ from 'jquery';
window.$ = window.jQuery = $;

import { initStorageAdapter } from './store-adapter.js';

// Must init storage before any store import runs
await initStorageAdapter();

// Now import everything else
const { UI } = await import('../src/ui/ui.js');
const { Teleprompter } = await import('../src/core/teleprompter.js');
const { store } = await import('../src/core/store.js');

class SidebarApp {
  constructor() {
    this.ui = new UI();
    this.teleprompter = new Teleprompter(this.ui);
  }

  init() {
    this.ui.init();
    this.teleprompter.init();

    this.ui.$elm.buttonPlay.on('click.teleprompter', () => {
      if (!store.getState().isPlaying) {
        const countdownEnabled = store.getState().countdown;
        if (countdownEnabled) {
          this.teleprompter.runCountdown(() => this.teleprompter.start());
        } else {
          this.teleprompter.start();
        }
      } else {
        this.teleprompter.stop();
      }
    });

    this.ui.$elm.buttonReset.on('click.teleprompter', () => {
      this.teleprompter.reset();
    });

    // Fullscreen button
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('fullscreen.html') });
      });
    }

    // Hide remote button (not present in sidebar.html, but guard anyway)
    const btnRemote = document.querySelector('.button.remote');
    if (btnRemote) btnRemote.style.display = 'none';
  }
}

window.onload = async () => {
  const app = new SidebarApp();
  app.init();
};
```

**Note on top-level await:** Vite supports top-level await in ES modules. The `await initStorageAdapter()` at the top level ensures chrome.storage is loaded before any store module initialises. The dynamic imports (`await import(...)`) after that guarantee correct ordering.

- [ ] **Step 2: Commit**

```bash
git add extension/sidebar.js
git commit -m "feat: add extension sidebar entry point"
```

---

## Task 9: Create fullscreen.html and fullscreen.js

**Files:**
- Create: `extension/fullscreen.html`
- Create: `extension/fullscreen.js`

- [ ] **Step 1: Create extension/fullscreen.html**

Identical structure to `sidebar.html` but without `sidebar.css`, and references `fullscreen.js`. The fullscreen tab has the full-width layout from `app.css` unchanged.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Teleprompter</title>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0">
    <link rel="stylesheet" href="../src/styles/app.css">
  </head>
  <body id="gui">
    <!-- Drafts panel -->
    <aside id="drafts-panel" class="drafts-panel" aria-hidden="true">
      <div class="drafts-header">
        <h2>Saved Scripts</h2>
        <button class="drafts-close" id="drafts-close" aria-label="Close" title="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="drafts-actions">
        <button class="drafts-btn primary" id="draft-save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Save Current
        </button>
        <button class="drafts-btn" id="draft-new">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New
        </button>
      </div>
      <ul class="drafts-list" id="drafts-list"></ul>
      <p class="drafts-empty" id="drafts-empty">No saved scripts yet.</p>
    </aside>
    <div id="drafts-backdrop" class="drafts-backdrop" hidden></div>

    <div id="countdown" class="countdown" hidden aria-live="assertive">
      <div class="countdown-num">3</div>
    </div>

    <div id="modal">
      <a class="button close-modal" href="javascript:void(0)" role="button" aria-label="Close Modal" title="Close Modal">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </a>
      <div class="modal-content">
        <div id="software-update" style="display:none"></div>
      </div>
      <div class="modal-overlay"></div>
    </div>

    <header>
      <h1>
        <svg class="logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 11l18-5v12L3 14v-3z"></path>
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>
        </svg>
        <span class="brand">Teleprompter</span>
        <span class="clock">00:00:00</span>
        <span class="stats" id="stats" aria-live="polite">
          <span class="stat-words"><span id="word-count">0</span> words</span>
          <span class="stat-sep">·</span>
          <span class="stat-time" id="reading-time">~0:00</span>
        </span>
      </h1>
      <nav>
        <div class="colors" role="group" aria-label="Color Pickers">
          <input type="color" id="text-color" value="#b3b33b" aria-label="Text Color" title="Text Color">
          <input type="color" id="background-color" value="#1f1610" aria-label="Background Color" title="Background Color">
        </div>
        <div class="sliders">
          <label class="font_size_label" aria-label="Font Size">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
            <span id="font-size-value">60</span>
            <input type="range" min="12" max="100" value="60" class="font_size slider" id="font-size-slider" aria-label="Font Size">
          </label>
          <label class="speed_label" aria-label="Page Speed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"></path><path d="m16.2 7.8 2.9-2.9"></path><path d="M18 12h4"></path><path d="m16.2 16.2 2.9 2.9"></path><circle cx="12" cy="14" r="8"></circle><path d="M12 14l3-3"></path></svg>
            <span id="speed-value">35</span>
            <input type="range" min="0" max="50" value="35" class="speed slider" id="speed-slider" aria-label="Page Speed">
          </label>
        </div>
        <div class="buttons" role="group" aria-label="Controls">
          <button class="theme-toggle" id="drafts-toggle" aria-label="Drafts" title="Saved Scripts" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
          </button>
          <button class="button small btn-dim dim-controls" aria-label="Reading Focus" title="Reading Focus">
            <svg class="dim-on" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor"></circle></svg>
            <svg class="dim-off" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 3"></line></svg>
          </button>
          <button class="button small btn-reset reset" aria-label="Reset" title="Reset">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path></svg>
          </button>
          <button class="button small btn-flipx flip-x" aria-label="Flip Horizontal" title="Flip Horizontal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"></path><path d="M16 7l4 5-4 5"></path><path d="M8 7l-4 5 4 5"></path></svg>
          </button>
          <button class="button small btn-flipy flip-y" aria-label="Flip Vertical" title="Flip Vertical">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"></path><path d="M7 8L12 4l5 4"></path><path d="M7 16l5 4 5-4"></path></svg>
          </button>
          <button class="button btn-play icon-play play active" aria-label="Play / Pause" title="Play / Pause">
            <svg class="play-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            <svg class="pause-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>
          </button>
        </div>
      </nav>
    </header>

    <article>
      <div class="overlay">
        <div class="top"></div>
        <div class="bottom"></div>
      </div>
      <div class="teleprompter" id="teleprompter" role="textbox" aria-multiline="true" aria-label="TelePrompter Text" contenteditable>
        Oh, hello there. Edit this text to get started.
      </div>
    </article>

    <script type="module" src="fullscreen.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create extension/fullscreen.js**

Identical to `sidebar.js` but without the fullscreen button handler:

```js
import $ from 'jquery';
window.$ = window.jQuery = $;

import { initStorageAdapter } from './store-adapter.js';

await initStorageAdapter();

const { UI } = await import('../src/ui/ui.js');
const { Teleprompter } = await import('../src/core/teleprompter.js');
const { store } = await import('../src/core/store.js');

class FullscreenApp {
  constructor() {
    this.ui = new UI();
    this.teleprompter = new Teleprompter(this.ui);
  }

  init() {
    this.ui.init();
    this.teleprompter.init();

    this.ui.$elm.buttonPlay.on('click.teleprompter', () => {
      if (!store.getState().isPlaying) {
        const countdownEnabled = store.getState().countdown;
        if (countdownEnabled) {
          this.teleprompter.runCountdown(() => this.teleprompter.start());
        } else {
          this.teleprompter.start();
        }
      } else {
        this.teleprompter.stop();
      }
    });

    this.ui.$elm.buttonReset.on('click.teleprompter', () => {
      this.teleprompter.reset();
    });

    const btnRemote = document.querySelector('.button.remote');
    if (btnRemote) btnRemote.style.display = 'none';
  }
}

window.onload = async () => {
  const app = new FullscreenApp();
  app.init();
};
```

- [ ] **Step 3: Commit**

```bash
git add extension/fullscreen.html extension/fullscreen.js
git commit -m "feat: add fullscreen tab entry point for extension"
```

---

## Task 10: Build extension and load in Chrome

**Files:**
- No new files — this task verifies the build works end-to-end.

- [ ] **Step 1: Run the extension build**

```bash
npm run build:ext
```

Expected: `dist/extension/` contains:
- `sidebar.js`
- `fullscreen.js`
- `background.js`
- (chunks directory if code-split)

If it fails with "top-level await not supported", add to `vite.config.ext.js`:

```js
build: {
  target: 'esnext',   // required for top-level await
  // ... rest of config
}
```

- [ ] **Step 2: Copy static files to dist/extension/**

Vite bundles JS but doesn't copy HTML, CSS, manifest, or icons automatically in lib mode. Add a post-build copy script or use `vite-plugin-static-copy`. The simplest approach without a plugin:

Add to `vite.config.ext.js`:

```js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

function copyExtensionStatics() {
  return {
    name: 'copy-extension-statics',
    closeBundle() {
      const out = 'dist/extension';
      mkdirSync(`${out}/icons`, { recursive: true });
      // HTML
      copyFileSync('extension/sidebar.html',    `${out}/sidebar.html`);
      copyFileSync('extension/fullscreen.html', `${out}/fullscreen.html`);
      // CSS
      copyFileSync('extension/sidebar.css',     `${out}/sidebar.css`);
      copyFileSync('src/styles/app.css',        `${out}/app.css`);
      // Manifest
      copyFileSync('extension/manifest.json',   `${out}/manifest.json`);
      // Icons
      copyFileSync('extension/icons/icon-16.png',  `${out}/icons/icon-16.png`);
      copyFileSync('extension/icons/icon-48.png',  `${out}/icons/icon-48.png`);
      copyFileSync('extension/icons/icon-128.png', `${out}/icons/icon-128.png`);
    }
  };
}

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist/extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidebar:    resolve(__dirname, 'extension/sidebar.js'),
        fullscreen: resolve(__dirname, 'extension/fullscreen.js'),
        background: resolve(__dirname, 'extension/background.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name][extmd]',
      },
    },
  },
  plugins: [copyExtensionStatics()],
});
```

**Also update sidebar.html and fullscreen.html** to reference bundled files and copied CSS:

In `sidebar.html`, change:
```html
<!-- Before -->
<link rel="stylesheet" href="../src/styles/app.css">
<link rel="stylesheet" href="sidebar.css">
<!-- After (dist/extension paths) -->
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="sidebar.css">
```

In `fullscreen.html`, change:
```html
<!-- Before -->
<link rel="stylesheet" href="../src/styles/app.css">
<!-- After -->
<link rel="stylesheet" href="app.css">
```

Re-run build:

```bash
npm run build:ext
```

Expected: `dist/extension/` now has all files needed to load as an extension.

- [ ] **Step 3: Load extension in Chrome**

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/extension/` folder
5. The Teleprompter extension should appear in the list

- [ ] **Step 4: Test the side panel**

1. Click the Teleprompter icon in the Chrome toolbar
2. The side panel should open on the right side
3. Verify: text editing works, sliders work, play/pause works, drafts panel opens
4. Click the fullscreen button (maximize icon) — a new tab should open with the same text

- [ ] **Step 5: Commit**

```bash
git add vite.config.ext.js extension/sidebar.html extension/fullscreen.html
git commit -m "build: complete extension build pipeline with static file copy"
```

---

## Task 11: Verify web build still works

- [ ] **Step 1: Run web build**

```bash
npm run build:web
```

Expected: `dist/web/` created with `index.html` and assets. No errors.

- [ ] **Step 2: Serve and test**

```bash
npx http-server dist/web -p 8080 -o
```

Open `http://localhost:8080` in Chrome. Verify:
- Text editing works
- Play/pause works
- Sliders work
- Drafts panel works
- Remote button is visible (even if socket not running)

- [ ] **Step 3: Commit**

```bash
git commit -m "build: verify web target builds and runs correctly"
```

If there are no changes to commit, skip this step.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Monorepo with two Vite build targets | Tasks 1, 4 |
| Core files moved to `src/` unchanged | Task 2 |
| Web entry point (`web/app.js`, `web/index.html`) | Task 3 |
| Vite configs (`vite.config.web.js`, `vite.config.ext.js`) | Task 4 |
| `store-adapter.js` + pluggable storage in `store.js` | Task 5 |
| Manifest V3 with sidePanel, storage, tabs permissions | Task 6 |
| `background.js` service worker | Task 6 |
| Icons 16/48/128px | Task 6 |
| `sidebar.html` with fullscreen button | Task 7 |
| `sidebar.css` two-row header layout | Task 7 |
| `sidebar.js` entry — no socket, no SW | Task 8 |
| `fullscreen.html` + `fullscreen.js` | Task 9 |
| Fullscreen opens new tab via `chrome.tabs.create` | Task 8 |
| Remote button removed in extension | Tasks 7, 8, 9 |
| `chrome.storage.local` for extension drafts | Task 5 |
| End-to-end build + Chrome load test | Task 10 |
| Web build still works | Task 11 |

All spec requirements are covered.
