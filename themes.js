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
    swatch: ["#1b1b1f", "#d4a832", "#f5f0e8"],
    vars: {
      "--paper":       "#1b1b1f",
      "--paper-dark":  "#26262b",
      "--paper-card":  "#232328",
      "--ink":         "#f5f0e8",
      "--ink-light":   "#cfc7ba",
      "--ink-faint":   "#948b7d",
      "--gold":        "#d4a832",
      "--line-color":  "#3a3a40",
      "--shadow":      "rgba(0, 0, 0, 0.4)",
      "--shadow-deep": "rgba(0, 0, 0, 0.6)"
    }
  },

  neon_cyberpunk: {
    label: "Neon Cyberpunk",
    swatch: ["#0d0d1a", "#ff2bd6", "#00f0ff"],
    vars: {
      "--paper":       "#0d0d1a",
      "--paper-dark":  "#14142a",
      "--paper-card":  "#131325",
      "--ink":         "#00f0ff",
      "--ink-light":   "#ff2bd6",
      "--ink-faint":   "#7d7dab",
      "--gold":        "#ff2bd6",
      "--line-color":  "#2a2a55",
      "--shadow":      "rgba(0, 240, 255, 0.25)",
      "--shadow-deep": "rgba(255, 43, 214, 0.3)"
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
const DEFAULT_THEME = "default";

export const THEME_UNLOCK_LEVELS = {
  default: 0,
  candy_pop: 3,
  soft_pastel: 3,
  dark_mode: 10,
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

/** Apply a theme's CSS variables to the document immediately. */
export function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.setAttribute("data-theme", THEMES[themeKey] ? themeKey : DEFAULT_THEME);
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
export function setTheme(themeKey) {
  applyTheme(themeKey);
  cacheThemeLocally(themeKey);
}
