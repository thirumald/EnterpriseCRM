import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessMinutes, businessMinutesBetween, priorityFor, type Calendar } from '../src/sla.ts';

const cal: Calendar = { utcOffsetMin: 0, holidays: ['2026-11-02'], hours: { '0': null, '1': [540, 1020], '2': [540, 1020], '3': [540, 1020], '4': [540, 1020], '5': [540, 1020], '6': null } };
const d = (s: string) => new Date(s + 'Z');

test('24x7 clock is plain addition', () => {
  assert.equal(addBusinessMinutes(d('2026-10-24T22:00:00'), 120, null).toISOString(), '2026-10-25T00:00:00.000Z');
});
test('within business hours', () => {
  assert.equal(addBusinessMinutes(d('2026-10-26T10:00:00'), 60, cal).toISOString(), '2026-10-26T11:00:00.000Z'); // Monday
});
test('overflows to next business day', () => {
  // Mon 16:30 + 60 business min -> 30 min today, 30 min Tue 09:00-09:30
  assert.equal(addBusinessMinutes(d('2026-10-26T16:30:00'), 60, cal).toISOString(), '2026-10-27T09:30:00.000Z');
});
test('starting outside hours begins at next opening', () => {
  assert.equal(addBusinessMinutes(d('2026-10-24T12:00:00'), 30, cal).toISOString(), '2026-10-26T09:30:00.000Z'); // Saturday -> Monday
});
test('skips holidays', () => {
  // Fri 16:00 + 120 min: 60 Fri, Mon 2 Nov is a holiday, so remaining 60 on Tue 3 Nov
  assert.equal(addBusinessMinutes(d('2026-10-30T16:00:00'), 120, cal).toISOString(), '2026-11-03T10:00:00.000Z');
});
test('timezone offset shifts the working window', () => {
  const ist: Calendar = { ...cal, utcOffsetMin: 330, holidays: [] };
  // 09:00 IST = 03:30 UTC
  assert.equal(addBusinessMinutes(d('2026-10-26T00:00:00'), 30, ist).toISOString(), '2026-10-26T04:00:00.000Z');
});
test('businessMinutesBetween is the inverse of addBusinessMinutes', () => {
  const start = d('2026-10-26T15:00:00');
  for (const mins of [30, 180, 600, 2400]) {
    const end = addBusinessMinutes(start, mins, cal);
    assert.ok(Math.abs(businessMinutesBetween(start, end, cal) - mins) < 1e-6, `mins=${mins}`);
  }
});
test('pause/resume: remaining business minutes are preserved across a weekend', () => {
  const start = d('2026-10-30T15:00:00');                 // Fri 15:00
  const due = addBusinessMinutes(start, 240, cal);          // 4h business
  const pausedAt = d('2026-10-30T16:00:00');
  const remaining = businessMinutesBetween(pausedAt, due, cal);
  assert.equal(remaining, 180);
  const resumed = addBusinessMinutes(d('2026-11-03T08:00:00'), remaining, cal); // Tue after holiday
  assert.equal(resumed.toISOString(), '2026-11-03T12:00:00.000Z');
});
test('priority matrix', () => {
  assert.equal(priorityFor('immediate', 'many'), 'P1');
  assert.equal(priorityFor('high', 'single'), 'P3');
  assert.equal(priorityFor('low', 'service'), 'P4');
});
