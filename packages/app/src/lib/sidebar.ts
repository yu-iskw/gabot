export const SIDEBAR_STORAGE_KEY = 'gabot-sidebar';

export function parseStoredSidebarOpen(value: string | null): boolean {
  return value !== 'collapsed';
}

export function applySidebarOpen(open: boolean): void {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'expanded' : 'collapsed');
}
