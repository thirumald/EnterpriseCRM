/** Pure SLA calendar math (no I/O) so it can be unit tested and replayed deterministically. */
export type Calendar = { utcOffsetMin: number; hours: Record<string, [number, number] | null>; holidays: string[] };
const DAY = 86_400_000;

function window(cal: Calendar, localDayStart: number): [number, number] | null {
  const d = new Date(localDayStart);
  const iso = d.toISOString().slice(0, 10);
  if (cal.holidays.includes(iso)) return null;
  return cal.hours[String(d.getUTCDay())] ?? null;
}

/** Add `minutes` of business time to `start`. `cal === null` means a 24x7 clock. */
export function addBusinessMinutes(start: Date, minutes: number, cal: Calendar | null): Date {
  if (!cal) return new Date(start.getTime() + minutes * 60_000);
  const off = cal.utcOffsetMin * 60_000;
  let local = start.getTime() + off;
  let remaining = minutes;
  for (let i = 0; i < 3660; i++) {
    const dayStart = Math.floor(local / DAY) * DAY;
    const w = window(cal, dayStart);
    if (w) {
      const m = (local - dayStart) / 60_000;
      const begin = Math.max(m, w[0]);
      if (begin < w[1]) {
        const avail = w[1] - begin;
        if (remaining <= avail) return new Date(dayStart + (begin + remaining) * 60_000 - off);
        remaining -= avail;
      }
    }
    local = dayStart + DAY;
  }
  throw new Error('calendar has no working time');
}

/** Business minutes elapsed between a and b (b > a). */
export function businessMinutesBetween(a: Date, b: Date, cal: Calendar | null): number {
  if (b <= a) return 0;
  if (!cal) return (b.getTime() - a.getTime()) / 60_000;
  const off = cal.utcOffsetMin * 60_000;
  let local = a.getTime() + off;
  const end = b.getTime() + off;
  let total = 0;
  while (local < end) {
    const dayStart = Math.floor(local / DAY) * DAY;
    const w = window(cal, dayStart);
    if (w) {
      const from = Math.max((local - dayStart) / 60_000, w[0]);
      const to = Math.min((end - dayStart) / 60_000, w[1]);
      if (to > from) total += to - from;
    }
    local = dayStart + DAY;
  }
  return total;
}

export const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  immediate: { many: 'P1', service: 'P1', single: 'P2' },
  high: { many: 'P1', service: 'P2', single: 'P3' },
  medium: { many: 'P2', service: 'P3', single: 'P3' },
  low: { many: 'P3', service: 'P4', single: 'P4' },
};
export function priorityFor(urgency: string, impact: string): string {
  return PRIORITY_MATRIX[urgency]?.[impact] ?? 'P3';
}

export type TimerState = { state: string; due_at: Date; target_min: number; started_at: Date; clock: string };
/** Percent of the target consumed at `now` (business-aware). */
export function pctConsumed(t: TimerState, now: Date, cal: Calendar | null): number {
  if (now >= t.due_at) return 100 + (businessMinutesBetween(t.due_at, now, cal) / t.target_min) * 100;
  const remaining = businessMinutesBetween(now, t.due_at, cal);
  return Math.max(0, (1 - remaining / t.target_min) * 100);
}
