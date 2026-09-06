export function CoworkerOrb({ size = 56 }: { size?: number }) {
  return <div aria-hidden className="coworker-orb" style={{ width: size, height: size }} />;
}
