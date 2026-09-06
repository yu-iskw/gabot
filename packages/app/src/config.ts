export function firebaseProjectId(env: Record<string, string | undefined> = {}): string {
  return env.VITE_FIREBASE_PROJECT_ID ?? 'demo-gabot';
}

export function firebaseAuthEmulatorHost(env: Record<string, string | undefined> = {}): string {
  return env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
}

export function apiBase(env: Record<string, string | undefined> = {}): string {
  return env.VITE_API_BASE ?? '';
}
