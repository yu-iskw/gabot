import { useState } from 'react';

import { CoworkerOrb } from './components/agents/coworker-orb.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { useAuth } from './lib/auth-context.js';

import type { FormEvent } from 'react';

export function LocatorPage() {
  const { directory, selectWorkspace } = useAuth();
  const [locator, setLocator] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const matched = await selectWorkspace(locator);
    if (!matched) {
      setError('Unknown workspace. Check the slug or domain.');
    }
  }

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center -mt-12">
      <div className="flex w-full max-w-xs flex-col items-center p-4">
        <CoworkerOrb size={56} />
        <h1 className="mt-8 text-center text-2xl font-medium tracking-tight">
          Find your workspace
        </h1>
        <form
          className="mt-8 flex w-full flex-col gap-2"
          onSubmit={(event) => void onSubmit(event)}
        >
          <Input
            name="workspace"
            autoComplete="organization"
            placeholder="Workspace slug or domain"
            value={locator}
            onChange={(event) => setLocator(event.target.value)}
          />
          <Button className="h-10 w-full tracking-tight" size="lg" type="submit" variant="outline">
            Continue
          </Button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        {directory ? (
          <ul className="mt-6 flex w-full flex-col gap-1">
            {directory.workspaces.map((workspace) => (
              <li key={workspace.slug}>
                <button
                  type="button"
                  data-testid={`workspace-locate-${workspace.slug}`}
                  className="h-9 w-full rounded-lg px-2 text-left text-sm hover:bg-muted"
                  onClick={() => void selectWorkspace(workspace.slug)}
                >
                  {workspace.displayName}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {workspace.domain ?? workspace.slug}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
