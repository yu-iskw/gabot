export const CATALOG_STAGES = [
  'publish',
  'admit',
  'install',
  'connect',
  'grant',
  'invoke',
] as const;

export type CatalogStage = (typeof CATALOG_STAGES)[number];

export type CatalogInvocationFlags = {
  admitted: boolean;
  connected: boolean;
  granted: boolean;
  installed: boolean;
};

export function invocationAuthorized(flags: CatalogInvocationFlags): boolean {
  return flags.admitted && flags.connected && flags.granted && flags.installed;
}
