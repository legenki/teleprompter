import { store } from './store.js';

export class RemoteSocket {
  constructor(ui) {
    this.ui = ui;
    this.socket = null;
    this.connected = false;
  }

  connect(remoteId) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const port = window.location.port ? ':' + window.location.port : '';
    
    this.socket = io.connect(protocol + '//' + window.location.hostname + port, {
      path: '/socket.io'
    });

    this.socket.on('connect', () => {
      this.socket.emit('connectToRemote', remoteId);
    });

    this.socket.on('connectedToRemote', () => {
      if (this.connected) return;

      this.ui.showControls(remoteId);
      
      this.socket.emit('sendRemoteControl', 'hideModal');
      this.socket.emit('sendRemoteControl', 'getConfig');

      this.connected = true;
    });

    this.socket.on('clientCommand', (command, value) => {
      switch (command) {
        case 'play':
          this.ui.$elm.play.classList.remove('icon-play');
          this.ui.$elm.play.classList.add('icon-pause');
          break;
        case 'stop':
          this.ui.$elm.play.classList.remove('icon-pause');
          this.ui.$elm.play.classList.add('icon-play');
          break;
        case 'updateTime':
          document.getElementById('current-time').innerHTML = value;
          break;
        case 'updateConfig':
          store.updateConfig(value);
          break;
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = null;
    this.connected = false;
    this.ui.hideControls();
  }

  emit(command, value) {
    if (this.socket && this.connected) {
      this.socket.emit('sendRemoteControl', command, value);
    }
  }
}
