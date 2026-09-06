export const THEME_STORAGE_KEY = 'gabot-theme';

export function parseStoredDarkTheme(value: string | null): boolean {
  return value === 'dark';
}

export function applyDarkTheme(dark: boolean): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
