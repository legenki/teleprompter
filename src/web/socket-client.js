import { store } from '../core/store.js';

export class SocketClient {
  constructor(ui, teleprompter) {
    this.ui = ui;
    this.teleprompter = teleprompter;
    this.socket = null;
    this.emitTimeout = null;
    this.timerExp = 10;
  }

  init() {
    // Listen to local config changes to broadcast them
    store.addEventListener('configChanged', () => this.emitConfigUpdate());
    store.addEventListener('scrollChanged', (e) => {
      if (this.socket && store.getState().remoteId) {
        this.socket.emit('clientCommand', 'updateConfig', { pageScrollPercent: e.detail });
      }
    });
    store.addEventListener('timeChanged', (e) => {
      if (this.socket && store.getState().remoteId) {
        this.socket.emit('clientCommand', 'updateTime', e.detail);
      }
    });
    store.addEventListener('playStateChanged', (e) => {
      if (this.socket && store.getState().remoteId) {
        this.socket.emit('clientCommand', e.detail ? 'play' : 'stop');
      }
    });
    
    // Bind UI refresh button
    const $refreshCode = document.getElementById('refresh-code');
    if ($refreshCode) {
      $refreshCode.addEventListener('click', () => {
        store.setRemoteId(null);
        if (this.socket) {
          try { this.socket.disconnect(); } catch (e) {}
          this.socket = null;
        }
        this.ui.$elm.buttonRemote.removeClass('active');
        this.connect();
      });
    }

    // Bind UI remote button
    this.ui.$elm.buttonRemote.on('click.teleprompter', () => {
      if (!this.socket && !store.getState().remoteId) {
        this.connect(store.getState().remoteId);
      } else {
        this.ui.$elm.modal.css('display', 'flex');
        this.ui.$elm.remoteControlModal.show();
        this.ui.$elm.softwareUpdate.hide();
        this.ui.modalOpen = true;
      }
      this.ui.$elm.buttonRemote.blur();
    });
  }

  randomString() {
    const chars = '3456789ABCDEFGHJKLMNPQRSTUVWXY';
    let string = '';
    for (let i = 0; i < 6; i++) {
      const num = Math.floor(Math.random() * chars.length);
      string += chars.substring(num, num + 1);
    }
    return string;
  }

  connect(currentRemote) {
    if (typeof io === 'undefined') {
      this.ui.$elm.buttonRemote.removeClass('active');
      store.setRemoteId(null);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const port = window.location.port ? ':' + window.location.port : '';
    const socketUrl = protocol + '//' + window.location.hostname + port;

    this.socket = io.connect(socketUrl, { path: '/socket.io' });
    const remote = currentRemote || this.randomString();

    this.socket.on('connect', () => {
      const $code = document.getElementById('qr-code');
      $code.innerHTML = '';
      this.socket.emit('connectToRemote', 'REMOTE_' + remote);

      this.ui.$elm.remoteURL.text(protocol + '//' + window.location.hostname + port + '/remote');
      const url = protocol + '//' + window.location.hostname + port + '/remote?id=' + remote;

      // Ensure QRCode is loaded via vendor.js
      if (typeof QRCode !== 'undefined') {
        new QRCode($code, url);
      }
      this.ui.$elm.remoteID.text(remote);

      if (!currentRemote) {
        this.ui.$elm.modal.css('display', 'flex');
        this.ui.$elm.remoteControlModal.show();
        this.ui.$elm.softwareUpdate.hide();
        this.ui.modalOpen = true;
      }
    });

    this.socket.on('disconnect', () => {
      this.ui.$elm.buttonRemote.removeClass('active');
      store.setRemoteId(null);
    });

    this.socket.on('connectedToRemote', () => {
      store.setRemoteId(remote);
      this.ui.$elm.buttonRemote.addClass('active');
      this.emitConfigUpdate();
    });

    this.socket.on('remoteControl', (command, value) => {
      switch (command) {
        case 'reset':
          this.teleprompter.reset();
          break;
        case 'power':
          this.disconnect();
          break;
        case 'play':
          this.ui.$elm.buttonPlay.trigger('click');
          break;
        case 'hideModal':
          this.ui.$elm.modal.hide();
          break;
        case 'getConfig':
          this.emitConfigUpdate();
          break;
        case 'updateConfig':
          this.remoteUpdate(value);
          break;
      }
    });

  }

  disconnect() {
    if (this.socket && store.getState().remoteId) {
      this.socket.disconnect();
      store.setRemoteId(null);
    }
  }

  emitConfigUpdate() {
    if (this.socket && store.getState().remoteId) {
      clearTimeout(this.emitTimeout);
      this.emitTimeout = setTimeout(() => {
        this.socket.emit('clientCommand', 'updateConfig', store.getState().config);
      }, this.timerExp);
    }
  }

  remoteUpdate(newConfig) {
    const oldConfig = store.getState().config;

    // Apply specific changes that require extra UI work
    if (oldConfig.dimControls !== newConfig.dimControls) {
      store.updateConfig({ dimControls: newConfig.dimControls }, true);
      this.ui.syncUIWithConfig(store.getState().config);
    }

    if (oldConfig.flipX !== newConfig.flipX) {
      store.updateConfig({ flipX: newConfig.flipX }, true);
      this.ui.syncUIWithConfig(store.getState().config);
    }

    if (oldConfig.flipY !== newConfig.flipY) {
      store.updateConfig({ flipY: newConfig.flipY }, true);
      this.ui.syncUIWithConfig(store.getState().config);
    }

    if (oldConfig.fontSize !== newConfig.fontSize) {
      store.updateConfig({ fontSize: newConfig.fontSize }, true);
      this.ui.syncUIWithConfig(store.getState().config);
    }

    if (oldConfig.pageSpeed !== newConfig.pageSpeed) {
      store.updateConfig({ pageSpeed: newConfig.pageSpeed }, true);
      this.ui.syncUIWithConfig(store.getState().config);
    }

    if (oldConfig.pageScrollPercent !== newConfig.pageScrollPercent) {
      store.updateConfig({ pageScrollPercent: newConfig.pageScrollPercent }, true);
      
      this.teleprompter.stop();
      
      const $win = this.ui.$elm.article[0];
      const scrollHeight = $win.scrollHeight;
      const clientHeight = $win.clientHeight;
      const maxScrollStop = scrollHeight - clientHeight;
      const percent = parseInt(newConfig.pageScrollPercent) / 100;
      const newScrollTop = maxScrollStop * percent;

      this.ui.$elm.article.stop().animate({ scrollTop: newScrollTop + 'px' }, 0, 'linear', () => {
        this.ui.$elm.article.clearQueue();
      });
    }

    this.ui.updateURL();
  }
}
