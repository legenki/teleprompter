chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture and transcribe interview call audio from the current tab',
  });
}

async function startCapture({ model, language, engine, gemini }) {
  // activeTab is granted for the tab where the user clicked the toolbar icon.
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('No active tab found');
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    throw new Error('Cannot capture this tab. Click the extension icon while on the call tab, then press Start.');
  }
  await ensureOffscreen();
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', streamId, model, language, engine, gemini });
  return { tabTitle: tab.title };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'background') return;
  if (msg.type === 'capture:start') {
    startCapture(msg).then(
      (r) => sendResponse({ ok: true, ...r }),
      (e) => sendResponse({ ok: false, error: e.message })
    );
    return true;
  }
  if (msg.type === 'capture:stop') {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => {});
    sendResponse({ ok: true });
  }
});
