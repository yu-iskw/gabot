import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';

import { CoworkerOrb } from './components/agents/coworker-orb.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

import type { Auth } from 'firebase/auth';
import type { FormEvent } from 'react';

export function SignPage({ auth }: { auth: Auth }) {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('gabot-admin-pass');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    }
  }

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center -mt-12">
      <div className="flex w-full max-w-xs flex-col items-center p-4">
        <CoworkerOrb size={56} />
        <h1 className="mt-8 text-center text-2xl font-medium tracking-tight">Sign in to gabot</h1>
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
      </div>
    </main>
  );
}
