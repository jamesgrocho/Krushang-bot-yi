/**
 * Theme Manager — Handle dark/light mode switching
 * Persists preference to localStorage
 * Supports system preference detection
 */

const THEME_KEY = 'krushang-theme-preference';
const THEME_LIGHT = 'light';

export const ThemeManager = {
  /**
   * Initialize theme on app startup
   * Light theme is the default and only theme
   */
  init() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || THEME_LIGHT;
    this.setTheme(theme);
  },

  /**
   * Apply light theme to document (only theme)
   */
  setTheme(theme) {
    const root = document.documentElement;
    root.classList.add('theme-light');
    localStorage.setItem(THEME_KEY, THEME_LIGHT);
  },

  /**
   * Get current theme (always light)
   */
  getCurrentTheme() {
    return THEME_LIGHT;
  },
};

export const { init, setTheme, getCurrentTheme, toggleTheme } = ThemeManager;
