import { store } from './store.js';
import { UI } from './ui.js';
import { Teleprompter } from './teleprompter.js';
import { SocketClient } from './socket-client.js';

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
    
    // Bind Play/Reset buttons
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

    // Check for software update
    this.ui.showSoftwareUpdate();

    // Init remote if id exists
    const currentRemote = store.getState().remoteId;
    if (currentRemote && currentRemote.length === 6) {
      setTimeout(() => {
        this.socketClient.connect(currentRemote);
      }, 1000);
    }
  }
}

// Initialize App
window.onload = () => {
  const app = new App();
  app.init();
};
