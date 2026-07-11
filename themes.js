// ============================================================
//  themes.js
//  Chithi Theme Engine — swaps CSS variables at runtime.
//  Works by overriding the same variables already defined in
//  styles.css under :root (--paper, --ink, --gold, etc.)
// ============================================================

// Each theme only needs to list the variables it changes.
// Anything not listed simply falls back to the default in styles.css.
export const THEMES = {
  default: {
    label: "Classic Chithi",
    swatch: ["#fdf8f0", "#b5860d", "#2c1e0f"],
    vars: {
      "--paper":       "#fdf8f0",
      "--paper-dark":  "#f5eed8",
      "--paper-card":  "#fffdf7",
      "--ink":         "#2c1e0f",
      "--ink-light":   "#5a4232",
      "--ink-faint":   "#8c7a6b",
      "--gold":        "#b5860d",
      "--line-color":  "#e8dcc8",
      "--shadow":      "rgba(44, 30, 15, 0.12)",
      "--shadow-deep": "rgba(44, 30, 15, 0.22)"
    }
  },

  candy_pop: {
    label: "Candy Pop",
    swatch: ["#fff0f6", "#ff6fae", "#5a1a3d"],
    vars: {
      "--paper":       "#fff0f6",
      "--paper-dark":  "#ffd9e8",
      "--paper-card":  "#fffafd",
      "--ink":         "#5a1a3d",
      "--ink-light":   "#8a3f68",
      "--ink-faint":   "#c17a9e",
      "--gold":        "#ff6fae",
      "--line-color":  "#ffc2dd",
      "--shadow":      "rgba(255, 111, 174, 0.18)",
      "--shadow-deep": "rgba(90, 26, 61, 0.25)"
    }
  },

  dark_mode: {
    label: "Dark Mode",
    swatch: ["#1b1b1f", "#d4a832", "#fbf9f6"],
    vars: {
      "--paper":       "#1b1b1f",
      "--paper-dark":  "#26262b",
      "--paper-card":  "#232328",
      "--ink":         "#aca290",
      "--ink-light":   "#dcd4c5",
      "--ink-faint":   "#aca290",
      "--gold":        "#d4a832",
      "--line-color":  "#3a3a40",
      "--shadow":      "rgba(0, 0, 0, 0.4)",
      "--shadow-deep": "rgba(0, 0, 0, 0.6)"
    }
  },

  neon_cyberpunk: {
    label: "Neon Cyberpunk",
    swatch: ["#eefcfa", "#1fd67a", "#0b1f1d"],
    vars: {
      "--paper":       "#eefcfa",
      "--paper-dark":  "#d8f5f0",
      "--paper-card":  "#f7fffd",
      "--ink":         "#0b1f1d",
      "--ink-light":   "#00b8d4",
      "--ink-faint":   "#5c8783",
      "--gold":        "#1fd67a",
      "--line-color":  "#b8e8e0",
      "--shadow":      "rgba(0, 184, 212, 0.15)",
      "--shadow-deep": "rgba(31, 214, 122, 0.22)"
    }
  },

  soft_pastel: {
    label: "Soft Pastel",
    swatch: ["#f7f9fc", "#9f8fef", "#4a5568"],
    vars: {
      "--paper":       "#f7f9fc",
      "--paper-dark":  "#eef1f8",
      "--paper-card":  "#ffffff",
      "--ink":         "#4a5568",
      "--ink-light":   "#718096",
      "--ink-faint":   "#a0aec0",
      "--gold":        "#9f8fef",
      "--line-color":  "#dbe3f0",
      "--shadow":      "rgba(159, 143, 239, 0.15)",
      "--shadow-deep": "rgba(74, 85, 104, 0.15)"
    }
  },

  private_garden: {
    label: "Private Garden",
    swatch: ["#0f2a22", "#f4c95d", "#f8f0d8"],
    vars: {
      "--paper":       "#0f2a22",
      "--paper-dark":  "#173b30",
      "--paper-card":  "#143429",
      "--ink":         "#f8f0d8",
      "--ink-light":   "#d9caa4",
      "--ink-faint":   "#a99b78",
      "--gold":        "#f4c95d",
      "--line-color":  "#31584b",
      "--shadow":      "rgba(2, 12, 9, 0.35)",
      "--shadow-deep": "rgba(244, 201, 93, 0.2)"
    }
  }
};

const STORAGE_KEY = "chithi_theme";
const GARDEN_COLORS_KEY = "chithi_garden_colors";
const DEFAULT_THEME = "default";
export const THEME_CHANGE_EVENT = "chithi-theme-change";
export const CUSTOMIZABLE_THEME = "private_garden";

// ── Small hex color helpers (no library needed) ─────────────
function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex({ r, g, b }) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
/** Mix hexA toward hexB by `weight` (0 = pure hexA, 1 = pure hexB). */
function mixHex(hexA, hexB, weight) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight
  });
}
function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function isValidHex(hex) {
  return typeof hex === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
}

/**
 * Build the full Private Garden variable set from just 3 user-picked
 * colors: background, text (ink), and accent (gold). Everything else
 * (lighter/darker shades, lines, shadows) is derived automatically so
 * the theme still looks cohesive no matter what the user picks.
 * Falls back to the built-in preset if colors are missing/invalid.
 */
export function buildPrivateGardenVars(customColors) {
  const preset = THEMES.private_garden.vars;
  const bg     = customColors?.bg;
  const ink    = customColors?.ink;
  const accent = customColors?.accent;

  if (!isValidHex(bg) || !isValidHex(ink) || !isValidHex(accent)) {
    return preset;
  }

  return {
    "--paper":       bg,
    "--paper-dark":  mixHex(bg, "#000000", 0.12),
    "--paper-card":  mixHex(bg, "#ffffff", 0.05),
    "--ink":         ink,
    "--ink-light":   mixHex(ink, bg, 0.3),
    "--ink-faint":   mixHex(ink, bg, 0.55),
    "--gold":        accent,
    "--line-color":  mixHex(bg, ink, 0.15),
    "--shadow":      hexToRgba(accent, 0.2),
    "--shadow-deep": hexToRgba(mixHex(bg, "#000000", 0.5), 0.4)
  };
}

/** Cache custom garden colors locally so they survive a page reload
 *  before Firestore data arrives (avoids a flash of the preset). */
export function cacheGardenColorsLocally(colors) {
  try {
    localStorage.setItem(GARDEN_COLORS_KEY, JSON.stringify(colors));
  } catch (_) { /* non-fatal */ }
}

export function getCachedGardenColors() {
  try {
    const raw = localStorage.getItem(GARDEN_COLORS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export const THEME_UNLOCK_LEVELS = {
  default: 0,
  candy_pop: 3,
  soft_pastel: 3,
  dark_mode: 3,
  neon_cyberpunk: 25,
  private_garden: 50
};

export function getUnlockedThemes(referralCount = 0) {
  const count = Number(referralCount) || 0;
  return Object.keys(THEMES).filter((themeKey) => {
    return count >= (THEME_UNLOCK_LEVELS[themeKey] || 0);
  });
}

export function isThemeUnlocked(themeKey, unlockedThemes = [DEFAULT_THEME]) {
  return themeKey === DEFAULT_THEME || unlockedThemes.includes(themeKey);
}

/** Apply a theme's CSS variables to the document immediately.
 *  Pass `customColors` ({bg, ink, accent}) when themeKey is
 *  "private_garden" and the user has customized it. */
export function applyTheme(themeKey, customColors) {
  const isGarden = themeKey === CUSTOMIZABLE_THEME;
  const vars = isGarden
    ? buildPrivateGardenVars(customColors)
    : (THEMES[themeKey] || THEMES[DEFAULT_THEME]).vars;

  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.setAttribute("data-theme", THEMES[themeKey] ? themeKey : DEFAULT_THEME);
  root.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { themeKey } }));
}

/** Cache the theme choice locally so it applies instantly on next page load
 *  (before Firestore data has a chance to arrive), avoiding a flash of the
 *  default theme. */
export function cacheThemeLocally(themeKey) {
  try {
    localStorage.setItem(STORAGE_KEY, themeKey);
  } catch (_) { /* localStorage may be unavailable — non-fatal */ }
}

/** Read the locally cached theme (if any). Call this + applyTheme() as
 *  early as possible on each page load. */
export function getCachedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  } catch (_) {
    return DEFAULT_THEME;
  }
}

/** Apply + cache in one step (use this whenever the user picks a theme). */
export function setTheme(themeKey, customColors) {
  applyTheme(themeKey, customColors);
  cacheThemeLocally(themeKey);
  if (themeKey === CUSTOMIZABLE_THEME && customColors) {
    cacheGardenColorsLocally(customColors);
  }
}
