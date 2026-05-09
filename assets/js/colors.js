/**
 * Color helpers used by both the prompter and (potentially) the remote.
 * Exposed as window.TPColors so plain <script> ordering works without
 * a bundler. All functions are pure.
 */
(function (root) {
  'use strict';

  function parseColor(input) {
    if (!input) return null;
    var s = String(input).trim();
    if (s.charAt(0) === '#') {
      if (s.length === 4) {
        return [
          parseInt(s[1] + s[1], 16),
          parseInt(s[2] + s[2], 16),
          parseInt(s[3] + s[3], 16)
        ];
      }
      if (s.length === 7) {
        return [
          parseInt(s.slice(1, 3), 16),
          parseInt(s.slice(3, 5), 16),
          parseInt(s.slice(5, 7), 16)
        ];
      }
    }
    var m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      var parts = m[1].split(',').map(function (x) { return parseFloat(x); });
      return [parts[0] | 0, parts[1] | 0, parts[2] | 0];
    }
    return null;
  }

  function lightenRGB(rgb, amount) {
    return [
      Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * amount)),
      Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * amount)),
      Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * amount))
    ];
  }

  function darkenRGB(rgb, amount) {
    return [
      Math.max(0, Math.round(rgb[0] * (1 - amount))),
      Math.max(0, Math.round(rgb[1] * (1 - amount))),
      Math.max(0, Math.round(rgb[2] * (1 - amount)))
    ];
  }

  function luminance(rgb) {
    var srgb = rgb.map(function (c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function rgbStr(rgb) { return rgb[0] + ', ' + rgb[1] + ', ' + rgb[2]; }
  function rgbCSS(rgb) { return 'rgb(' + rgbStr(rgb) + ')'; }

  /**
   * Apply an accent color to the live CSS variables that the UI uses.
   * Returns true if the color was valid, false otherwise.
   */
  function applyAccent(color) {
    var rgb = parseColor(color);
    if (!rgb) return false;
    var hover = lightenRGB(rgb, 0.18);
    var s = document.documentElement.style;
    s.setProperty('--tp-ui-accent', rgbCSS(rgb));
    s.setProperty('--tp-ui-accent-hover', rgbCSS(hover));
    s.setProperty('--tp-ui-accent-soft', 'rgba(' + rgbStr(rgb) + ', .15)');
    s.setProperty('--tp-ui-accent-rgb', rgbStr(rgb));
    return true;
  }

  /**
   * Apply a surface (background) color and derive a coherent palette
   * (surface2 / surface3 / border / text / muted) on :root.
   */
  function applySurface(color) {
    var rgb = parseColor(color);
    if (!rgb) return false;
    var isDark = luminance(rgb) < 0.5;
    var step = isDark ? lightenRGB : darkenRGB;
    var surface2 = step(rgb, 0.10);
    var surface3 = step(rgb, 0.18);
    var border   = step(rgb, 0.25);
    var textRGB  = isDark ? [244, 234, 216] : [31, 22, 16];
    var mutedRGB = isDark ? [184, 168, 146] : [80, 64, 48];
    var s = document.documentElement.style;
    s.setProperty('--tp-ui-bg',       rgbCSS(rgb));
    s.setProperty('--tp-ui-surface',  rgbCSS(rgb));
    s.setProperty('--tp-ui-surface2', rgbCSS(surface2));
    s.setProperty('--tp-ui-surface3', rgbCSS(surface3));
    s.setProperty('--tp-ui-border',   rgbCSS(border));
    s.setProperty('--tp-ui-text',     rgbCSS(textRGB));
    s.setProperty('--tp-ui-muted',    rgbCSS(mutedRGB));
    return true;
  }

  /**
   * Paint the filled portion of a native <input type="range"> via the
   * --fill CSS variable (used by the WebKit gradient track).
   */
  function paintRangeFill(input, min, max) {
    if (!input) return;
    var v = parseFloat(input.value);
    var pct = ((v - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }

  root.TPColors = {
    parseColor: parseColor,
    lightenRGB: lightenRGB,
    darkenRGB:  darkenRGB,
    luminance:  luminance,
    rgbStr:     rgbStr,
    rgbCSS:     rgbCSS,
    applyAccent:    applyAccent,
    applySurface:   applySurface,
    paintRangeFill: paintRangeFill
  };
})(typeof window !== 'undefined' ? window : this);
