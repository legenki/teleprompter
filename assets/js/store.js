import { DEFAULTS, KEYS } from './config.js';

function safeGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (e) { return fallback; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (e) { return false; }
}

class TeleprompterStore extends EventTarget {
  constructor() {
    super();
    this.state = this.loadInitialState();
  }

  loadInitialState() {
    // Parse URL params first to override localStorage if present
    const urlParams = this.getUrlVars();
    
    // Background Color
    let backgroundColor = DEFAULTS.backgroundColor;
    if (urlParams && urlParams.backgroundColor) {
      backgroundColor = decodeURIComponent(urlParams.backgroundColor);
      safeSet(KEYS.backgroundColor, backgroundColor);
    } else if (safeGet(KEYS.backgroundColor, null)) {
      backgroundColor = safeGet(KEYS.backgroundColor, null);
    }

    // Text Color
    let textColor = DEFAULTS.textColor;
    if (urlParams && urlParams.textColor) {
      textColor = decodeURIComponent(urlParams.textColor);
      safeSet(KEYS.textColor, textColor);
    } else if (safeGet(KEYS.textColor, null)) {
      textColor = safeGet(KEYS.textColor, null);
    }

    // Dim Controls
    let dimControls = DEFAULTS.dimControls;
    if (urlParams && urlParams.dimControls) {
      dimControls = decodeURIComponent(urlParams.dimControls) === 'true';
      safeSet(KEYS.dimControls, dimControls);
    } else if (safeGet(KEYS.dimControls, null) !== null) {
      dimControls = safeGet(KEYS.dimControls, null) === 'true';
    }

    // Flip X
    let flipX = DEFAULTS.flipX;
    if (urlParams && urlParams.flipX) {
      flipX = decodeURIComponent(urlParams.flipX) === 'true';
      safeSet(KEYS.flipX, flipX);
    } else if (safeGet(KEYS.flipX, null) !== null) {
      flipX = safeGet(KEYS.flipX, null) === 'true';
    }

    // Flip Y
    let flipY = DEFAULTS.flipY;
    if (urlParams && urlParams.flipY) {
      flipY = decodeURIComponent(urlParams.flipY) === 'true';
      safeSet(KEYS.flipY, flipY);
    } else if (safeGet(KEYS.flipY, null) !== null) {
      flipY = safeGet(KEYS.flipY, null) === 'true';
    }

    // Font Size
    let fontSize = DEFAULTS.fontSize;
    if (urlParams && urlParams.fontSize) {
      fontSize = parseInt(decodeURIComponent(urlParams.fontSize), 10);
      safeSet(KEYS.fontSize, fontSize);
    } else if (safeGet(KEYS.fontSize, null) !== null) {
      fontSize = parseInt(safeGet(KEYS.fontSize, null), 10);
    }

    // Page Speed
    let pageSpeed = DEFAULTS.pageSpeed;
    if (urlParams && urlParams.pageSpeed) {
      pageSpeed = parseInt(decodeURIComponent(urlParams.pageSpeed), 10);
      safeSet(KEYS.speed, pageSpeed);
    } else if (safeGet(KEYS.speed, null) !== null) {
      pageSpeed = parseInt(safeGet(KEYS.speed, null), 10);
    }

    return {
      config: {
        backgroundColor,
        textColor,
        dimControls,
        flipX,
        flipY,
        fontSize,
        pageSpeed
      },
      text: safeGet(KEYS.text, ''),
      isPlaying: false,
      currentTime: '00:00:00',
      remoteId: safeGet(KEYS.remoteId, null),
      countdown: safeGet(KEYS.countdown, '1') !== '0'
    };
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

  getState() {
    return this.state;
  }

  updateConfig(newConfig, skipEvent = false) {
    this.state.config = { ...this.state.config, ...newConfig };
    
    // Persist to localStorage
    if (newConfig.backgroundColor !== undefined) safeSet(KEYS.backgroundColor, newConfig.backgroundColor);
    if (newConfig.textColor !== undefined) safeSet(KEYS.textColor, newConfig.textColor);
    if (newConfig.dimControls !== undefined) safeSet(KEYS.dimControls, newConfig.dimControls);
    if (newConfig.flipX !== undefined) safeSet(KEYS.flipX, newConfig.flipX);
    if (newConfig.flipY !== undefined) safeSet(KEYS.flipY, newConfig.flipY);
    if (newConfig.fontSize !== undefined) safeSet(KEYS.fontSize, newConfig.fontSize);
    if (newConfig.pageSpeed !== undefined) safeSet(KEYS.speed, newConfig.pageSpeed);

    if (!skipEvent) {
      this.dispatchEvent(new CustomEvent('configChanged', { detail: this.state.config }));
    }
  }

  setPlaying(isPlaying) {
    if (this.state.isPlaying !== isPlaying) {
      this.state.isPlaying = isPlaying;
      this.dispatchEvent(new CustomEvent('playStateChanged', { detail: isPlaying }));
    }
  }

  setText(text) {
    this.state.text = text;
    safeSet(KEYS.text, text);
    this.dispatchEvent(new CustomEvent('textChanged', { detail: text }));
  }

  setRemoteId(remoteId) {
    this.state.remoteId = remoteId;
    if (remoteId) {
      safeSet(KEYS.remoteId, remoteId);
    } else {
      try { localStorage.removeItem(KEYS.remoteId); } catch (e) {}
    }
    this.dispatchEvent(new CustomEvent('remoteIdChanged', { detail: remoteId }));
  }

  setTime(time) {
    this.state.currentTime = time;
    this.dispatchEvent(new CustomEvent('timeChanged', { detail: time }));
  }
}

export const store = new TeleprompterStore();
