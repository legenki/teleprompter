import { store } from './store.js';

export class Teleprompter {
  constructor(ui) {
    this.ui = ui;
    this.scrollDelay = null;
    this.timeout = null;
    
    // Bind methods
    this.pageScroll = this.pageScroll.bind(this);
    this.updateStats = this.updateStats.bind(this);

    // Listen to changes
    store.addEventListener('textChanged', this.updateStats);
    store.addEventListener('configChanged', this.updateStats);
  }

  init() {
    this.updateStats();
  }

  cleanText() {
    const $teleprompter = this.ui.$elm.teleprompter;
    let text = $teleprompter.html();
    text = text.replace(/<br>+/g, '@@').replace(/@@@@/g, '</p><p>');
    text = text.replace(/@@/g, '<br>');
    text = text.replace(/([a-z])\. ([A-Z])/g, '$1.&nbsp;&nbsp; $2');
    text = text.replace(/<p><\/p>/g, '');

    if (text && text.substr(0, 3) !== '<p>') {
      text = '<p>' + text + '</p>';
    }

    $teleprompter.html(text);
    $('p:empty', $teleprompter).remove();
  }

  updateStats() {
    const $teleprompter = this.ui.$elm.teleprompter;
    const text = ($teleprompter.text() || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

    const state = store.getState();
    const speed = state.config.pageSpeed || 0;
    const wpm = 80 + (speed / 50) * 140;
    const seconds = words > 0 ? Math.round((words / wpm) * 60) : 0;
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    const formatted = '~' + mm + ':' + (ss < 10 ? '0' : '') + ss;

    const $w = document.getElementById('word-count');
    const $t = document.getElementById('reading-time');
    if ($w) $w.textContent = words;
    if ($t) $t.textContent = formatted;
  }

  start() {
    if (store.getState().isPlaying) return;

    this.ui.$elm.teleprompter.attr('contenteditable', false);
    this.ui.$elm.body.addClass('playing');
    this.ui.$elm.buttonPlay.removeClass('icon-play').addClass('icon-pause');

    if (store.getState().config.dimControls) {
      this.ui.$elm.markerOverlay.addClass('show');
    }

    this.ui.timer.startTimer();
    this.pageScroll();

    store.setPlaying(true);
  }

  stop() {
    if (!store.getState().isPlaying) return;

    clearTimeout(this.scrollDelay);
    this.ui.$elm.teleprompter.attr('contenteditable', true);

    if (store.getState().config.dimControls) {
      this.ui.$elm.markerOverlay.removeClass('show');
    }

    this.ui.$elm.buttonPlay.removeClass('icon-pause').addClass('icon-play');
    this.ui.$elm.body.removeClass('playing');

    this.ui.timer.stopTimer();

    store.setPlaying(false);
  }

  reset() {
    this.stop();
    this.ui.timer.resetTimer();

    store.updateConfig({ pageScrollPercent: 0 }, true);

    this.ui.$elm.article.stop().animate({
      scrollTop: 0
    }, 100, 'linear', () => {
      this.ui.$elm.article.clearQueue();
    });
  }

  pageScroll() {
    const offset = 1;
    const animate = 0;
    const config = store.getState().config;
    const $elm = this.ui.$elm;

    if (config.pageSpeed === 0) {
      $elm.article.stop().clearQueue();
      clearTimeout(this.scrollDelay);
      this.scrollDelay = setTimeout(this.pageScroll, 500);
      return;
    }

    clearTimeout(this.scrollDelay);
    this.scrollDelay = setTimeout(this.pageScroll, Math.floor(50 - config.pageSpeed));

    if ($elm.teleprompter.hasClass('flip-y')) {
      $elm.article.stop().animate({
        scrollTop: '-=' + offset + 'px'
      }, animate, 'linear', () => {
        $elm.article.clearQueue();
      });

      if ($elm.article.scrollTop() === 0) {
        this.stop();
        setTimeout(() => {
          $elm.article.stop().animate({
            scrollTop: $elm.teleprompter.height() + 100
          }, 500, 'swing', () => {
            $elm.article.clearQueue();
          });
        }, 500);
      }
    } else {
      $elm.article.stop().animate({
        scrollTop: '+=' + offset + 'px'
      }, animate, 'linear', () => {
        $elm.article.clearQueue();
      });

      if ($elm.article.scrollTop() >= (($elm.article[0].scrollHeight - $elm.window.height()) - 100)) {
        this.stop();
        setTimeout(() => {
          $elm.article.stop().animate({
            scrollTop: 0
          }, 500, 'swing', () => {
            $elm.article.clearQueue();
          });
        }, 500);
      }
    }

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      $elm.win = $elm.article[0];
      const scrollHeight = $elm.win.scrollHeight;
      const scrollTop = $elm.win.scrollTop;
      const clientHeight = $elm.win.clientHeight;

      const pageScrollPercent = Math.round(((scrollTop / (scrollHeight - clientHeight)) + Number.EPSILON) * 100);
      
      if (store.getState().config.pageScrollPercent !== pageScrollPercent) {
        store.updateConfig({ pageScrollPercent }, true);
        store.dispatchEvent(new CustomEvent('scrollChanged', { detail: pageScrollPercent }));
      }
    }, animate);
  }

  runCountdown(onDone) {
    const $cd = document.getElementById('countdown');
    const $num = $cd && $cd.querySelector('.countdown-num');
    if (!$cd || !$num) { onDone(); return; }
    
    $cd.hidden = false;
    let n = 3;
    const tick = () => {
      $num.textContent = n;
      $num.style.animation = 'none';
      $num.offsetHeight; 
      $num.style.animation = '';
      if (n === 0) {
        setTimeout(() => { $cd.hidden = true; onDone(); }, 800);
      } else {
        n--;
        setTimeout(tick, 1000);
      }
    };
    tick();
  }
}
