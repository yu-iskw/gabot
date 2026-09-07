export function isAuthEmulatorHost(authDomain: string): boolean {
  return (
    /:\d+$/.test(authDomain) ||
    authDomain.startsWith('127.0.0.1') ||
    authDomain.startsWith('localhost')
  );
}
