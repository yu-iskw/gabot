import type { RegistryEntry, RegistryPort } from './ports.js';

export function createStaticRegistry(entries: RegistryEntry[]): RegistryPort {
  return {
    list(): RegistryEntry[] {
      return [...entries];
    },
  };
}
