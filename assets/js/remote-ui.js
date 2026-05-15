import { store } from './store.js';
import { KEYS } from './config.js';
import { paintRangeFill, applyAccent, applySurface } from './colors.js';

export class RemoteUI {
  constructor(socketClient) {
    this.socketClient = socketClient;
    this.$elm = {};
    
    this.timerID = null;
    this.timeout = null;
    this.pressHoldEvent = new CustomEvent('pressHold');
    this.isPressing = false;
    this.debounce = 5;
    this.count = 0;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    
    // Listen to store changes
    store.addEventListener('configChanged', () => this.updateUI());
  }

  cacheElements() {
    this.$elm.control = document.getElementById('remote-control');
    this.$elm.dim = document.getElementById('button-dim');
    this.$elm.down = document.getElementById('button-down');
    this.$elm.faster = document.getElementById('button-faster');
    this.$elm.flipX = document.getElementById('button-flip-x');
    this.$elm.flipY = document.getElementById('button-flip-y');
    this.$elm.input = document.getElementsByClassName('remote-id')[0];
    this.$elm.play = document.getElementById('button-play');
    this.$elm.power = document.getElementById('button-power');
    this.$elm.reset = document.getElementById('button-reset');
    this.$elm.setup = document.getElementById('remote-setup');
    this.$elm.slider = document.getElementById('slider');
    this.$elm.sliderSelect = document.getElementById('slider-select');
    this.$elm.slower = document.getElementById('button-slower');
    this.$elm.up = document.getElementById('button-up');
  }

  bindEvents() {
    document.addEventListener('focusout', () => {
      if (!this.socketClient.connected) {
        this.handleInput();
      }
    });

    this.$elm.dim.addEventListener('click', (e) => {
      e.preventDefault();
      const config = store.getState().config;
      store.updateConfig({ dimControls: !config.dimControls }, true);
      this.updateUI('dim');
      this.socketClient.emit('updateConfig', store.getState().config);
    });

    const pressingDown = (e) => this.pressingDown(e);
    const notPressingDown = (e) => this.notPressingDown(e);

    // Down
    this.$elm.down.addEventListener('mousedown', pressingDown);
    this.$elm.down.addEventListener('touchstart', pressingDown, {passive: false});
    this.$elm.down.addEventListener('mouseup', notPressingDown);
    this.$elm.down.addEventListener('mouseleave', notPressingDown);
    this.$elm.down.addEventListener('touchend', notPressingDown);
    this.$elm.down.addEventListener('pressHold', (e) => this.handleDownPress(e));
    this.$elm.down.addEventListener('click', (e) => this.handleDownPress(e));

    // Faster
    this.$elm.faster.addEventListener('mousedown', pressingDown);
    this.$elm.faster.addEventListener('touchstart', pressingDown, {passive: false});
    this.$elm.faster.addEventListener('mouseup', notPressingDown);
    this.$elm.faster.addEventListener('mouseleave', notPressingDown);
    this.$elm.faster.addEventListener('touchend', notPressingDown);
    this.$elm.faster.addEventListener('pressHold', (e) => this.handleFasterPress(e));
    this.$elm.faster.addEventListener('click', (e) => this.handleFasterPress(e));

    // Flip X
    this.$elm.flipX.addEventListener('click', (e) => {
      e.preventDefault();
      const config = store.getState().config;
      store.updateConfig({ flipX: !config.flipX }, true);
      this.updateUI('flip-x');
      this.socketClient.emit('updateConfig', store.getState().config);
    });

    // Flip Y
    this.$elm.flipY.addEventListener('click', (e) => {
      e.preventDefault();
      const config = store.getState().config;
      store.updateConfig({ flipY: !config.flipY }, true);
      this.updateUI('flip-y');
      this.socketClient.emit('updateConfig', store.getState().config);
    });

    // Input
    this.$elm.input.addEventListener('keyup', (e) => {
      this.$elm.input.classList.remove('error', 'success');
      if (e.keyCode === 13) {
        this.handleInput();
      }
    });

    // Play
    this.$elm.play.addEventListener('click', (e) => {
      e.preventDefault();
      this.socketClient.emit('play');
    });

    // Power
    this.$elm.power.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.socketClient.connected && confirm('Are you sure you want to quit the Remote?')) {
        this.socketClient.emit('power');
        this.socketClient.disconnect();
      }
    });

    // Reset
    this.$elm.reset.addEventListener('click', (e) => {
      e.preventDefault();
      this.socketClient.emit('reset');
    });

    // Slider
    this.$elm.slider.addEventListener('input', (e) => {
      clearTimeout(this.timeout);
      const control = this.$elm.sliderSelect.value;
      const val = parseInt(e.target.value);
      const min = parseFloat(this.$elm.slider.min) || 0;
      const max = parseFloat(this.$elm.slider.max) || 50;

      const updates = {};
      if (control === 'font') updates.fontSize = val;
      else if (control === 'scroll') updates.pageScrollPercent = val;
      else if (control === 'speed') updates.pageSpeed = val;

      store.updateConfig(updates, true);
      paintRangeFill(this.$elm.slider, min, max);

      this.timeout = setTimeout(() => {
        this.socketClient.emit('updateConfig', store.getState().config);
      }, 100);
    });

    this.$elm.sliderSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const config = store.getState().config;
      let min = 0, max = 50;
      
      if (val === 'font') {
        min = 12; max = 100;
        this.$elm.slider.value = config.fontSize;
      } else if (val === 'scroll') {
        max = 100;
        this.$elm.slider.value = config.pageScrollPercent;
      } else if (val === 'speed') {
        max = 50;
        this.$elm.slider.value = config.pageSpeed;
      }
      this.$elm.slider.setAttribute('min', min);
      this.$elm.slider.setAttribute('max', max);
      paintRangeFill(this.$elm.slider, min, max);
      this.$elm.sliderSelect.blur();
    });

    // Slower
    this.$elm.slower.addEventListener('mousedown', pressingDown);
    this.$elm.slower.addEventListener('touchstart', pressingDown, {passive: false});
    this.$elm.slower.addEventListener('mouseup', notPressingDown);
    this.$elm.slower.addEventListener('mouseleave', notPressingDown);
    this.$elm.slower.addEventListener('touchend', notPressingDown);
    this.$elm.slower.addEventListener('pressHold', (e) => this.handleSlowerPress(e));
    this.$elm.slower.addEventListener('click', (e) => this.handleSlowerPress(e));

    // Up
    this.$elm.up.addEventListener('mousedown', pressingDown);
    this.$elm.up.addEventListener('touchstart', pressingDown, {passive: false});
    this.$elm.up.addEventListener('mouseup', notPressingDown);
    this.$elm.up.addEventListener('mouseleave', notPressingDown);
    this.$elm.up.addEventListener('touchend', notPressingDown);
    this.$elm.up.addEventListener('pressHold', (e) => this.handleUpPress(e));
    this.$elm.up.addEventListener('click', (e) => this.handleUpPress(e));
  }

  showControls(remoteId) {
    this.$elm.setup.style.display = 'none';
    this.$elm.control.style.display = 'flex';
    localStorage.setItem(KEYS.remoteId, remoteId);
    document.getElementById('remote-id').innerHTML = remoteId.replace('REMOTE_', 'REMOTE:&nbsp; ');
    this.$elm.input.value = '';
    this.$elm.input.classList.remove('error', 'success');
  }

  hideControls() {
    localStorage.removeItem(KEYS.remoteId);
    this.$elm.setup.style.display = 'flex';
    this.$elm.control.style.display = 'none';
  }

  handleInput() {
    if (this.$elm.input.value && this.$elm.input.value.length === 6) {
      this.$elm.input.blur();
      this.$elm.input.classList.add('success');
      const remote = 'REMOTE_' + this.$elm.input.value.toUpperCase();
      this.socketClient.connect(remote);
    } else {
      this.$elm.input.classList.add('error');
    }
  }

  handleDownPress(e) {
    if (e && e.preventDefault) e.preventDefault();
    let val = store.getState().config.pageScrollPercent + 1;
    if (val > 100) val = 100;
    store.updateConfig({ pageScrollPercent: val }, true);
    this.updateUI('slider');
    this.socketClient.emit('updateConfig', store.getState().config);
  }

  handleUpPress(e) {
    if (e && e.preventDefault) e.preventDefault();
    let val = store.getState().config.pageScrollPercent - 1;
    if (val < 0) val = 0;
    store.updateConfig({ pageScrollPercent: val }, true);
    this.updateUI('slider');
    this.socketClient.emit('updateConfig', store.getState().config);
  }

  handleFasterPress(e) {
    if (e && e.preventDefault) e.preventDefault();
    let val = store.getState().config.pageSpeed + 1;
    if (val > 50) val = 50;
    store.updateConfig({ pageSpeed: val }, true);
    this.updateUI('slider');
    this.socketClient.emit('updateConfig', store.getState().config);
  }

  handleSlowerPress(e) {
    if (e && e.preventDefault) e.preventDefault();
    let val = store.getState().config.pageSpeed - 1;
    if (val < 0) val = 0;
    store.updateConfig({ pageSpeed: val }, true);
    this.updateUI('slider');
    this.socketClient.emit('updateConfig', store.getState().config);
  }

  pressingDown(e) {
    this.count = 0;
    this.isPressing = true;
    const target = e.target;
    requestAnimationFrame(() => this.timer(target));
    if (e && e.preventDefault) e.preventDefault();
  }

  notPressingDown(e) {
    this.isPressing = false;
    cancelAnimationFrame(this.timerID);
  }

  timer(target) {
    if (this.isPressing) {
      this.count++;
      if (this.count === this.debounce) {
        this.count = 0;
        this.timerID = requestAnimationFrame(() => {
          target.dispatchEvent(this.pressHoldEvent);
          this.timer(target);
        });
      } else {
        this.timerID = requestAnimationFrame(() => this.timer(target));
      }
    }
  }

  updateUI(controller) {
    clearTimeout(this.timeout);
    const config = store.getState().config;

    if (!controller || controller === 'dim') {
      if (config.dimControls) {
        this.$elm.dim.classList.remove('icon-eye-open');
        this.$elm.dim.classList.add('icon-eye-close');
      } else {
        this.$elm.dim.classList.remove('icon-eye-close');
        this.$elm.dim.classList.add('icon-eye-open');
      }
    }

    if (!controller || controller === 'flip-x') {
      if (config.flipX) this.$elm.flipX.classList.add('active');
      else this.$elm.flipX.classList.remove('active');
    }

    if (!controller || controller === 'flip-y') {
      if (config.flipY) this.$elm.flipY.classList.add('active');
      else this.$elm.flipY.classList.remove('active');
    }

    if (!controller || controller === 'slider') {
      const control = this.$elm.sliderSelect.value;
      let min = 0, max = 50;
      if (control === 'font') {
        this.$elm.slider.value = config.fontSize;
        min = 12; max = 100;
      } else if (control === 'scroll') {
        this.$elm.slider.value = config.pageScrollPercent;
        max = 100;
      } else if (control === 'speed') {
        this.$elm.slider.value = config.pageSpeed;
        max = 50;
      }
      paintRangeFill(this.$elm.slider, min, max);
    }

    if (!controller) {
      if (config.textColor) applyAccent(config.textColor);
      if (config.backgroundColor) applySurface(config.backgroundColor);
    }
  }
}
