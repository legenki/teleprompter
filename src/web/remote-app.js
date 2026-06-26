import { store } from '../core/store.js';
import { KEYS } from '../core/config.js';
import { RemoteSocket } from './remote-socket.js';
import { RemoteUI } from './remote-ui.js';

class RemoteApp {
  constructor() {
    this.ui = null;
    this.socketClient = null;
  }

  init() {
    this.socketClient = new RemoteSocket(null); // Will set UI after instantiation
    this.ui = new RemoteUI(this.socketClient);
    this.socketClient.ui = this.ui;
    
    this.ui.init();

    const currentRemote = localStorage.getItem(KEYS.remoteId);
    const urlParamID = this.getRemoteIdFromUrl();

    if (urlParamID) {
      const remote = 'REMOTE_' + urlParamID.toUpperCase();
      this.socketClient.connect(remote);
    } else if (currentRemote && currentRemote.length === 13) {
      this.socketClient.connect(currentRemote);
    }
  }

  getRemoteIdFromUrl() {
    if (window.location.href.indexOf('id') > -1) {
      return this.getUrlVars()['id'];
    }
    return null;
  }

  getUrlVars() {
    let paramCount = 0;
    const vars = {};
    window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key, value) => {
      paramCount++;
      vars[key] = value;
    });
    return paramCount > 0 ? vars : null;
  }
}

// Initialize App
window.onload = () => {
  const app = new RemoteApp();
  app.init();
};
