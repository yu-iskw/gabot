import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useState } from 'react';

import { apiHeaders } from './api.js';
import { CoworkerOrb } from './components/agents/coworker-orb.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { apiBase } from './config.js';
import { useAuth } from './lib/auth-context.js';

import type { WorkspaceDirectoryEntry } from './lib/workspace-directory.js';
import type { Auth } from 'firebase/auth';
import type { FormEvent } from 'react';

export function SignPage({ auth, entry }: { auth: Auth; entry: WorkspaceDirectoryEntry }) {
  const { clearWorkspace } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('gabot-admin-pass');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const token = await credential.user.getIdToken();
      const response = await fetch(`${apiBase()}/api/me`, {
        headers: apiHeaders(token),
      });
      if (response.status === 403) {
        await signOut(auth);
        setError("You don't have access to this workspace");
        return;
      }
      if (!response.ok) {
        await signOut(auth);
        setError('Sign-in failed');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    }
  }

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center -mt-12">
      <div className="flex w-full max-w-xs flex-col items-center p-4">
        <CoworkerOrb size={56} />
        <h1 className="mt-8 text-center text-2xl font-medium tracking-tight">
          Sign in to {entry.displayName}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {entry.domain ?? entry.slug}
        </p>
        <form
          className="mt-8 flex w-full flex-col gap-2"
          onSubmit={(event) => void onSubmit(event)}
        >
          <Input
            name="email"
            autoComplete="username"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button className="h-10 w-full tracking-tight" size="lg" type="submit" variant="outline">
            Sign in
          </Button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <Button
          className="mt-4"
          variant="ghost"
          type="button"
          onClick={() => void clearWorkspace()}
        >
          Change workspace
        </Button>
      </div>
    </main>
  );
}
