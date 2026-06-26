import $ from 'jquery';
window.$ = window.jQuery = $;

import { initStorageAdapter } from './store-adapter.js';

await initStorageAdapter();

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

    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('fullscreen.html') });
      });
    }

    const btnRemote = document.querySelector('.button.remote');
    if (btnRemote) btnRemote.style.display = 'none';
  }
}

window.onload = async () => {
  const app = new SidebarApp();
  app.init();
};
