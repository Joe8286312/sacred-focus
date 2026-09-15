export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'sacred-focus-theme';
const DEFAULT_THEME: Theme = 'light';

function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light';
}

/** 读取用户已保存的主题；首次访问默认使用更易读的浅色模式。 */
export function getTheme(): Theme {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(savedTheme) ? savedTheme : DEFAULT_THEME;
}

/** 将主题立即应用到整个页面，并记住用户偏好。 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleTheme(theme: Theme): Theme {
  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
  return nextTheme;
}
