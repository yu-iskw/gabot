import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function isMainModule(moduleUrl: string, argv1 = process.argv[1]): boolean {
  if (!argv1) {
    return false;
  }
  try {
    return pathToFileURL(resolve(argv1)).href === moduleUrl;
  } catch {
    return false;
  }
}
