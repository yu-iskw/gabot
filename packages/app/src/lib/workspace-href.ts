import { useWorkspaceDirectory } from './workspace-directory-context.js';

/** Absolute app path under the active workspace. */
export function useWorkspaceHref(path: string): string {
  const { slug } = useWorkspaceDirectory();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `/workspaces/${slug}${suffix}`;
}
