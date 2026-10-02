// Chrome offscreen document: captures tab audio and feeds the shared STT engine.
import { createStt } from './lib/stt.js';

const send = (msg) => chrome.runtime.sendMessage({ from: 'offscreen', ...msg }).catch(() => {});
const stt = createStt(send);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'start') {
    stt.start({
      model: msg.model,
      playback: true, // capturing a tab mutes it, so play it back unchanged
      getStream: () => navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
        video: false,
      }),
    }).catch((e) => {
      send({ type: 'error', error: e.message });
      send({ type: 'status', state: 'idle', detail: 'Stopped' });
    });
  } else if (msg.type === 'stop') {
    stt.stop().then(() => send({ type: 'status', state: 'idle', detail: 'Stopped' }));
  }
});
