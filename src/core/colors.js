export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim();
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
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map(x => parseFloat(x));
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0];
  }
  return null;
}

export const lightenRGB = (rgb, amount) => [
  Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * amount)),
  Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * amount)),
  Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * amount))
];

export const darkenRGB = (rgb, amount) => [
  Math.max(0, Math.round(rgb[0] * (1 - amount))),
  Math.max(0, Math.round(rgb[1] * (1 - amount))),
  Math.max(0, Math.round(rgb[2] * (1 - amount)))
];

export function luminance(rgb) {
  const srgb = rgb.map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export const rgbStr = rgb => `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
export const rgbCSS = rgb => `rgb(${rgbStr(rgb)})`;

/**
 * Apply an accent color to the live CSS variables that the UI uses.
 * Returns true if the color was valid, false otherwise.
 */
export function applyAccent(color) {
  const rgb = parseColor(color);
  if (!rgb) return false;
  const hover = lightenRGB(rgb, 0.18);
  const s = document.documentElement.style;
  s.setProperty('--tp-ui-accent',       rgbCSS(rgb));
  s.setProperty('--tp-ui-accent-hover', rgbCSS(hover));
  s.setProperty('--tp-ui-accent-soft',  `rgba(${rgbStr(rgb)}, .15)`);
  s.setProperty('--tp-ui-accent-rgb',   rgbStr(rgb));
  return true;
}

/**
 * Apply a surface (background) color and derive a coherent palette
 * (surface2 / surface3 / border / text / muted) on :root.
 */
export function applySurface(color) {
  const rgb = parseColor(color);
  if (!rgb) return false;
  const isDark   = luminance(rgb) < 0.5;
  const step     = isDark ? lightenRGB : darkenRGB;
  const surface2 = step(rgb, 0.10);
  const surface3 = step(rgb, 0.18);
  const border   = step(rgb, 0.25);
  const textRGB  = isDark ? [244, 234, 216] : [31, 22, 16];
  const mutedRGB = isDark ? [184, 168, 146] : [80, 64, 48];
  const s = document.documentElement.style;
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
export function paintRangeFill(input, min, max) {
  if (!input) return;
  const v = parseFloat(input.value);
  const pct = ((v - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}
