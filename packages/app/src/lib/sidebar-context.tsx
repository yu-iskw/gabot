import { createContext, useContext, useState } from 'react';

import { applySidebarOpen, parseStoredSidebarOpen, SIDEBAR_STORAGE_KEY } from './sidebar.js';

import type { ReactNode } from 'react';

type SidebarState = {
  open: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() =>
    parseStoredSidebarOpen(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)),
  );

  function toggle(): void {
    const next = !open;
    setOpen(next);
    applySidebarOpen(next);
  }

  return <SidebarContext.Provider value={{ open, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarState {
  const value = useContext(SidebarContext);
  if (!value) {
    throw new Error('SidebarProvider missing');
  }
  return value;
}

export function useOptionalSidebar(): SidebarState | null {
  return useContext(SidebarContext);
}
