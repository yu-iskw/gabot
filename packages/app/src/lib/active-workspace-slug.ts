const STORAGE_KEY = 'gabot.workspaceSlug';

let activeSlug = '';

function readStoredWorkspaceSlug(): string {
  if (typeof sessionStorage === 'undefined') {
    return '';
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setActiveWorkspaceSlug(slug: string): void {
  activeSlug = slug;
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    if (slug) {
      sessionStorage.setItem(STORAGE_KEY, slug);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or quota.
  }
}

export function getActiveWorkspaceSlug(): string {
  return activeSlug || readStoredWorkspaceSlug();
}
