export async function resolveProjectId(
  selectedProject: string,
  newProjectName: string,
  createNamedProject: (name: string) => Promise<string>,
): Promise<string | undefined> {
  const name = newProjectName.trim();
  if (!name) {
    return selectedProject || undefined;
  }
  return createNamedProject(name);
}
