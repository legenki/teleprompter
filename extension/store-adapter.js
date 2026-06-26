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
