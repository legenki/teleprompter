import { store } from './store.js';
import { Timer } from './timer.js';
import { paintRangeFill, applyAccent, applySurface } from './colors.js';
import { KEYS } from './config.js';

export class UI {
  constructor() {
    this.$elm = {};
    this.timer = null;
    this.timerURL = null;
    this.modalOpen = false;
    this.version = 'v1.3.0';
  }

  init() {
    this.cacheElements();
    
    this.timer = new Timer(document.querySelectorAll('.clock'), {
      stopVal: 10000,
      onChange: (time) => {
        store.setTime(time);
      }
    });

    this.bindEvents();
    this.initUIState();
    this.bindDrafts();
  }

  cacheElements() {
    this.$elm.article = $('article');
    this.$elm.backgroundColor = $('#background-color');
    this.$elm.body = $('body');
    this.$elm.buttonDimControls = $('.button.dim-controls');
    this.$elm.buttonFlipX = $('.button.flip-x');
    this.$elm.buttonFlipY = $('.button.flip-y');
    this.$elm.buttonPlay = $('.button.play');
    this.$elm.buttonRemote = $('.button.remote');
    this.$elm.buttonReset = $('.button.reset');
    this.$elm.closeModal = $('.close-modal');
    this.$elm.fontSize = $('.font_size');
    this.$elm.header = $('header');
    this.$elm.markerOverlay = $('.overlay');
    this.$elm.modal = $('#modal');
    this.$elm.remoteID = $('.remote-id');
    this.$elm.remoteURL = $('.remote-url');
    this.$elm.remoteControlModal = $('#remote-control-modal');
    this.$elm.speed = $('.speed');
    this.$elm.softwareUpdate = $('#software-update');
    this.$elm.teleprompter = $('#teleprompter');
    this.$elm.textColor = $('#text-color');
    this.$elm.window = $(window);
  }

  bindEvents() {
    const self = this;
    
    this.$elm.backgroundColor.on('change.teleprompter', () => {
      store.updateConfig({ backgroundColor: this.$elm.backgroundColor.val() });
      this.updateURL();
    });

    this.$elm.textColor.on('change.teleprompter', () => {
      store.updateConfig({ textColor: this.$elm.textColor.val() });
      this.updateURL();
    });

    this.$elm.buttonDimControls.on('click.teleprompter', () => {
      store.updateConfig({ dimControls: !store.getState().config.dimControls });
      this.updateURL();
    });

    this.$elm.buttonFlipX.on('click.teleprompter', () => {
      this.timer.resetTimer();
      store.setTime('00:00:00');
      store.updateConfig({ flipX: !store.getState().config.flipX });
      this.updateURL();
    });

    this.$elm.buttonFlipY.on('click.teleprompter', () => {
      this.timer.resetTimer();
      store.setTime('00:00:00');
      const newFlipY = !store.getState().config.flipY;
      store.updateConfig({ flipY: newFlipY });
      this.jumpToStart(newFlipY);
      this.updateURL();
    });

    this.$elm.fontSize.val(store.getState().config.fontSize);
    this.$elm.fontSize.on('input change', (e) => {
      store.updateConfig({ fontSize: parseInt(e.target.value, 10) });
      this.updateURL();
    });

    this.$elm.speed.val(store.getState().config.pageSpeed);
    this.$elm.speed.on('input change', (e) => {
      store.updateConfig({ pageSpeed: parseInt(e.target.value, 10) });
      this.updateURL();
    });
    this.$elm.closeModal.on('click.teleprompter', () => this.handleCloseModal());

    this.$elm.teleprompter.keyup((evt) => {
      if (evt.keyCode === 27) {
        this.$elm.teleprompter.blur();
        evt.preventDefault();
        evt.stopPropagation();
        return false;
      }
      store.setText(this.$elm.teleprompter.html());
    });

    this.$elm.body.keydown((evt) => this.handleNavigate(evt));

    // Listen to store changes
    store.addEventListener('configChanged', (e) => this.syncUIWithConfig(e.detail));
    store.addEventListener('textChanged', () => {
      // Clean up empty paragraphs
      $('p:empty', this.$elm.teleprompter).remove();
    });
  }

  handleCloseModal() {
    if (this.$elm.remoteControlModal.is(':visible')) {
      this.$elm.buttonRemote.focus();
    }
    this.$elm.modal.hide();
    this.$elm.remoteControlModal.hide();
    this.$elm.softwareUpdate.hide();
    this.modalOpen = false;
  }

  handleNavigate(evt) {
    const space = 32, escape = 27, left = 37, up = 38, right = 39, down = 40,
          page_up = 33, page_down = 34, b_key = 66, f5_key = 116, period_key = 190, tab = 9;

    const speed = parseInt(this.$elm.speed.val(), 10);
    const font_size = parseInt(this.$elm.fontSize.val(), 10);

    if (evt.target.id === 'teleprompter' || evt.keyCode === tab) return;

    if (evt.keyCode === escape && this.modalOpen) {
      this.handleCloseModal();
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }

    if (this.modalOpen || evt.target.nodeName === 'INPUT' || evt.target.nodeName === 'BUTTON' || evt.target.nodeName === 'A' || evt.target.nodeName === 'SPAN') {
      return;
    }

    if (evt.keyCode === escape) {
      this.$elm.buttonReset.trigger('click');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    } else if (evt.keyCode === space || [b_key, f5_key, period_key].includes(evt.keyCode)) {
      this.$elm.buttonPlay.trigger('click');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    } else if (evt.keyCode === left || evt.keyCode === page_up) {
      this.$elm.speed.val(Math.max(0, speed - 1)).trigger('change');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    } else if (evt.keyCode === down) {
      this.$elm.fontSize.val(Math.max(12, font_size - 1)).trigger('change');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    } else if (evt.keyCode === up) {
      this.$elm.fontSize.val(Math.min(100, font_size + 1)).trigger('change');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    } else if (evt.keyCode === right || evt.keyCode === page_down) {
      this.$elm.speed.val(Math.min(50, speed + 1)).trigger('change');
      evt.preventDefault();
      evt.stopPropagation();
      return false;
    }
  }

  initUIState() {
    const config = store.getState().config;
    const text = store.getState().text;

    if (text) {
      this.$elm.teleprompter.html(text);
    }

    this.syncPrompterToTheme(config);
    this.syncUIWithConfig(config);

    this.jumpToStart(config.flipY);

    this.$elm.markerOverlay.removeClass('show');
    this.$elm.teleprompter.addClass('ready');
  }

  jumpToStart(flipY) {
    if (flipY) {
      this.$elm.article.stop().animate({ scrollTop: this.$elm.teleprompter.height() + 100 }, 250, 'swing', () => { this.$elm.article.clearQueue(); });
    } else {
      this.$elm.article.stop().animate({ scrollTop: 0 }, 250, 'swing', () => { this.$elm.article.clearQueue(); });
    }
  }

  syncPrompterToTheme(config) {
    try { localStorage.removeItem('teleprompter_theme'); } catch (e) {}

    let hasUserBg = !!localStorage.getItem(KEYS.backgroundColor);
    let hasUserText = !!localStorage.getItem(KEYS.textColor);
    const legacyBgs = ['#ffffff', '#0d1117', '#141414'];
    const legacyText = ['#1f2328', '#1a1916', '#f0f6fc', '#ffffff'];

    if (legacyBgs.includes(config.backgroundColor.toLowerCase())) hasUserBg = false;
    if (legacyText.includes(config.textColor.toLowerCase())) hasUserText = false;

    if (!hasUserBg) {
      store.updateConfig({ backgroundColor: '#1f1610' }, true);
    }
    if (!hasUserText) {
      store.updateConfig({ textColor: '#b3b33b' }, true);
    }
  }

  syncUIWithConfig(config) {
    // Colors
    this.$elm.backgroundColor.val(config.backgroundColor);
    this.$elm.article.css('background-color', config.backgroundColor);
    this.$elm.body.css('background-color', config.backgroundColor);
    this.$elm.teleprompter.css('background-color', config.backgroundColor);
    applySurface(config.backgroundColor);

    this.$elm.textColor.val(config.textColor);
    this.$elm.teleprompter.css('color', config.textColor);
    applyAccent(config.textColor);

    // Dim Controls
    if (config.dimControls) {
      this.$elm.buttonDimControls.removeClass('icon-eye-open').addClass('icon-eye-close');
      if (store.getState().isPlaying) this.$elm.markerOverlay.addClass('show');
    } else {
      this.$elm.buttonDimControls.removeClass('icon-eye-close').addClass('icon-eye-open');
      this.$elm.markerOverlay.removeClass('show');
    }

    // Flips
    this.$elm.teleprompter.removeClass('flip-x flip-y flip-xy');
    this.$elm.buttonFlipX.removeClass('active');
    this.$elm.buttonFlipY.removeClass('active');
    
    if (config.flipX && config.flipY) {
      this.$elm.teleprompter.addClass('flip-xy');
      this.$elm.buttonFlipX.addClass('active');
      this.$elm.buttonFlipY.addClass('active');
    } else if (config.flipX) {
      this.$elm.teleprompter.addClass('flip-x');
      this.$elm.buttonFlipX.addClass('active');
    } else if (config.flipY) {
      this.$elm.teleprompter.addClass('flip-y');
      this.$elm.buttonFlipY.addClass('active');
    }

    // Font Size
    this.$elm.fontSize.val(config.fontSize);
    this.$elm.teleprompter.css({
      'font-size': config.fontSize + 'px',
      'line-height': Math.ceil(config.fontSize * 1.5) + 'px',
      'padding-bottom': Math.ceil(this.$elm.window.height() - this.$elm.header.height()) + 'px'
    });
    $('p', this.$elm.teleprompter).css({
      'padding-bottom': Math.ceil(config.fontSize * 0.25) + 'px',
      'margin-bottom': Math.ceil(config.fontSize * 0.25) + 'px'
    });
    $('label.font_size_label > span').first().text(config.fontSize);
    paintRangeFill(this.$elm.fontSize[0], 12, 100);

    // Speed
    this.$elm.speed.val(config.pageSpeed);
    $('label.speed_label > span').first().text(config.pageSpeed);
    paintRangeFill(this.$elm.speed[0], 0, 50);
  }

  updateURL() {
    clearTimeout(this.timerURL);
    this.timerURL = setTimeout(() => {
      if (window.location.protocol === 'file:') return;
      try {
        const config = store.getState().config;
        const custom = { ...config };
        // Clean defaults would go here if needed, keeping simple for now
        
        const path = window.location.pathname;
        if (Object.keys(custom).length > 0) {
          const urlParams = new URLSearchParams(custom);
          window.history.pushState(custom, 'TelePrompter', path + '?' + urlParams);
        } else {
          window.history.pushState(null, 'TelePrompter', path);
        }
      } catch (error) {
        console.warn('Failed to update URL:', error);
      }
    }, 10);
  }

  bindDrafts() {
    const $draftsBtn = document.getElementById('drafts-toggle');
    const $draftsClose = document.getElementById('drafts-close');
    const $draftsBackdrop = document.getElementById('drafts-backdrop');
    const $draftSave = document.getElementById('draft-save');
    const $draftNew = document.getElementById('draft-new');

    const closeDraftsPanel = () => {
      const $p = document.getElementById('drafts-panel');
      if ($p) { $p.classList.remove('open'); $p.setAttribute('aria-hidden', 'true'); }
      if ($draftsBackdrop) $draftsBackdrop.hidden = true;
    };

    const openDraftsPanel = () => {
      const $p = document.getElementById('drafts-panel');
      if ($p) { $p.classList.add('open'); $p.setAttribute('aria-hidden', 'false'); }
      if ($draftsBackdrop) $draftsBackdrop.hidden = false;
      this.renderDrafts();
    };

    if ($draftsBtn) $draftsBtn.addEventListener('click', openDraftsPanel);
    if ($draftsClose) $draftsClose.addEventListener('click', closeDraftsPanel);
    if ($draftsBackdrop) $draftsBackdrop.addEventListener('click', closeDraftsPanel);
    if ($draftSave) $draftSave.addEventListener('click', () => {
      const name = prompt('Name this script:', '');
      if (name === null) return;
      const drafts = this.loadDrafts();
      const id = 'd_' + Date.now();
      drafts.unshift({
        id, name: (name || '').trim() || 'Untitled',
        text: this.$elm.teleprompter.html(),
        created: Date.now(), updated: Date.now()
      });
      this.saveDrafts(drafts);
      localStorage.setItem(KEYS.activeDraft, id);
      this.renderDrafts();
    });
    if ($draftNew) $draftNew.addEventListener('click', () => {
      if (this.$elm.teleprompter.text().trim() && !confirm('Discard current text and start a new script?')) return;
      this.$elm.teleprompter.html('<p>Type your new script here...</p>');
      store.setText(this.$elm.teleprompter.html());
      localStorage.removeItem(KEYS.activeDraft);
      this.renderDrafts();
      closeDraftsPanel();
      this.$elm.teleprompter.focus();
    });

    this.renderDrafts();
  }

  loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.drafts)) || [];
    } catch (e) { return []; }
  }

  saveDrafts(drafts) {
    try { localStorage.setItem(KEYS.drafts, JSON.stringify(drafts)); } catch (e) {}
  }

  renderDrafts() {
    const drafts = this.loadDrafts();
    const $list = document.getElementById('drafts-list');
    const $empty = document.getElementById('drafts-empty');
    if (!$list || !$empty) return;
    
    $list.innerHTML = '';
    if (!drafts.length) {
      $empty.classList.remove('hidden');
      return;
    }
    $empty.classList.add('hidden');
    const activeId = localStorage.getItem(KEYS.activeDraft);
    
    drafts.forEach(d => {
      const li = document.createElement('li');
      if (d.id === activeId) li.classList.add('active');
      li.dataset.id = d.id;
      const preview = (d.text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 60);
      const date = new Date(d.updated || d.created || Date.now()).toLocaleString();
      li.innerHTML = `<div class="draft-info">
        <div class="draft-name"></div>
        <div class="draft-meta"></div>
        </div>
        <button class="draft-delete" aria-label="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
        </button>`;
      li.querySelector('.draft-name').textContent = d.name || preview || 'Untitled';
      li.querySelector('.draft-meta').textContent = date;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.draft-delete')) return;
        this.$elm.teleprompter.html(d.text || '');
        store.setText(d.text || '');
        localStorage.setItem(KEYS.activeDraft, d.id);
        this.renderDrafts();
        document.getElementById('drafts-panel').classList.remove('open');
        document.getElementById('drafts-backdrop').hidden = true;
      });
      li.querySelector('.draft-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('Delete this script?')) return;
        const newDrafts = this.loadDrafts().filter(x => x.id !== d.id);
        this.saveDrafts(newDrafts);
        if (activeId === d.id) localStorage.removeItem(KEYS.activeDraft);
        this.renderDrafts();
      });
      $list.appendChild(li);
    });
  }

  showSoftwareUpdate() {
    const currentVersion = localStorage.getItem(KEYS.version);
    if (currentVersion !== this.version) {
      if (store.getState().text && currentVersion !== null) {
        this.$elm.modal.css('display', 'flex');
        this.$elm.remoteControlModal.hide();
        this.$elm.softwareUpdate.show();
        this.modalOpen = true;
      }
      localStorage.setItem(KEYS.version, this.version);
    }
  }
}
