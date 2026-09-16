import {
  getNextTheme,
  getThemeFromStoredValue,
  type Theme
} from '../../shared/theme/theme';

export type { Theme } from '../../shared/theme/theme';

const THEME_STORAGE_KEY = 'sacred-focus-theme';

/** 读取用户已保存的主题；首次访问默认使用更易读的浅色模式。 */
export function getTheme(): Theme {
  return getThemeFromStoredValue(localStorage.getItem(THEME_STORAGE_KEY));
}

/** 将主题立即应用到整个页面，并记住用户偏好。 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleTheme(theme: Theme): Theme {
  const nextTheme = getNextTheme(theme);
  setTheme(nextTheme);
  return nextTheme;
}
