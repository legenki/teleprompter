/**
 * TelePrompter shared config (used by both the main app and the remote).
 * Exposed as window.TPConfig so plain <script> ordering works without
 * a bundler.
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    backgroundColor:    '#1f1610',
    dimControls:        true,
    flipX:              false,
    flipY:              false,
    fontSize:           60,
    pageSpeed:          35,
    pageScrollPercent:  0,
    textColor:          '#b3b33b'
  };

  // localStorage key map. Useful so we don't sprinkle string literals
  // across the codebase.
  var KEYS = {
    text:            'teleprompter_text',
    version:         'teleprompter_version',
    remoteId:        'teleprompter_remote_id',
    backgroundColor: 'teleprompter_background_color',
    textColor:       'teleprompter_text_color',
    dimControls:     'teleprompter_dim_controls',
    flipX:           'teleprompter_flip_x',
    flipY:           'teleprompter_flip_y',
    fontSize:        'teleprompter_font_size',
    speed:           'teleprompter_speed',
    drafts:          'teleprompter_drafts',
    activeDraft:     'teleprompter_active_draft',
    countdown:       'teleprompter_countdown'
  };

  function safeGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // Typed wrappers around the string-only localStorage API.
  var Store = {
    getString: function (key, fallback) { return safeGet(key, fallback); },
    getBool:   function (key, fallback) {
      var v = safeGet(key, null);
      if (v === null) return fallback;
      return v === 'true' || v === '1';
    },
    getInt:    function (key, fallback) {
      var v = safeGet(key, null);
      if (v === null) return fallback;
      var n = parseInt(v, 10);
      return isNaN(n) ? fallback : n;
    },
    set:       function (key, value) { return safeSet(key, value); },
    remove:    safeRemove
  };

  root.TPConfig = {
    DEFAULTS: DEFAULTS,
    KEYS:     KEYS,
    Store:    Store
  };
})(typeof window !== 'undefined' ? window : this);
