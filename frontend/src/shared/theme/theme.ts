export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'light';

export function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light';
}

/** 将浏览器持久化值归一为应用可用主题。 */
export function getThemeFromStoredValue(value: string | null): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** 保留既有的二态切换规则：只有 dark 会切至 light，其余运行时值切至 dark。 */
export function getNextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
