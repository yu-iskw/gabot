import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

import { firebaseAuthEmulatorHost, firebaseProjectId } from './config.js';

import type { Auth } from 'firebase/auth';

export function createFirebaseAuth(): Auth {
  const projectId = firebaseProjectId(import.meta.env);
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: 'demo-gabot',
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      });
  const auth = getAuth(app);
  const emulator = `http://${firebaseAuthEmulatorHost(import.meta.env)}`;
  try {
    connectAuthEmulator(auth, emulator, { disableWarnings: true });
  } catch {
    // Already connected during Vite HMR.
  }
  return auth;
}
