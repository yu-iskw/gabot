export function nextRoutineRun(cron: string, now = new Date()): Date {
  if (cron.trim() === '* * * * *') {
    return now;
  }
  return new Date(now.getTime() + 60 * 60_000);
}
