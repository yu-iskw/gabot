import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo } from 'react';

import { setActiveWorkspaceSlug } from './active-workspace-slug.js';
import {
  defaultWorkspaceEntry,
  fetchWorkspaceDirectory,
  findWorkspaceEntry,
} from './workspace-directory.js';

import type { WorkspaceDirectory, WorkspaceDirectoryEntry } from './workspace-directory.js';
import type { ReactNode } from 'react';

type WorkspaceDirectoryValue = {
  directory: WorkspaceDirectory;
  entry: WorkspaceDirectoryEntry;
  slug: string;
};

const WorkspaceDirectoryContext = createContext<WorkspaceDirectoryValue | null>(null);

export function WorkspaceDirectoryProvider({
  children,
  slug,
}: {
  children: ReactNode;
  slug: string;
}) {
  const listing = useQuery({
    queryFn: fetchWorkspaceDirectory,
    queryKey: ['workspace-directory'],
    staleTime: Infinity,
  });

  const value = useMemo<WorkspaceDirectoryValue | null>(() => {
    if (!listing.data) {
      return null;
    }
    const entry = findWorkspaceEntry(listing.data, slug) ?? defaultWorkspaceEntry(listing.data);
    return { directory: listing.data, entry, slug: entry.slug };
  }, [listing.data, slug]);

  useEffect(() => {
    if (value) {
      setActiveWorkspaceSlug(value.slug);
    }
  }, [value]);

  if (listing.isError) {
    return <p className="p-6 text-sm text-muted-foreground">Could not load workspace directory</p>;
  }
  if (!value) {
    return <p className="p-6 text-sm text-muted-foreground">Loading workspaces…</p>;
  }

  return (
    <WorkspaceDirectoryContext.Provider value={value}>
      {children}
    </WorkspaceDirectoryContext.Provider>
  );
}

export function useWorkspaceDirectory(): WorkspaceDirectoryValue {
  const value = useContext(WorkspaceDirectoryContext);
  if (!value) {
    throw new Error('useWorkspaceDirectory requires WorkspaceDirectoryProvider');
  }
  return value;
}
