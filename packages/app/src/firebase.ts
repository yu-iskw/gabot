import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

import { isAuthEmulatorHost } from './lib/auth-emulator-host.js';

import type { WorkspaceDirectoryEntry } from './lib/workspace-directory.js';
import type { Auth } from 'firebase/auth';

export function createFirebaseAuth(entry: WorkspaceDirectoryEntry): Auth {
  const projectId = entry.tokenAudience;
  const existing = getApps().find((app) => app.name === entry.slug);
  const app =
    existing ??
    initializeApp(
      {
        apiKey: projectId,
        authDomain: isAuthEmulatorHost(entry.authDomain)
          ? `${projectId}.firebaseapp.com`
          : entry.authDomain,
        projectId,
      },
      entry.slug,
    );
  const auth = getAuth(app);
  if (isAuthEmulatorHost(entry.authDomain)) {
    const emulator = `http://${entry.authDomain}`;
    try {
      connectAuthEmulator(auth, emulator, { disableWarnings: true });
    } catch {
      // Already connected during Vite HMR.
    }
  }
  return auth;
}
