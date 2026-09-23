import { test } from "node:test";
import assert from "node:assert/strict";
import { easternDayStart, easternWallClockToUtc, utcToEasternWallClock } from "./time";

test("a wall clock in daylight time resolves at UTC-4", () => {
  // First pitch of the 2026 Wild Card round: noon ET on Sept 29, EDT.
  const at = easternWallClockToUtc("2026-09-29T12:05");
  assert.equal(at?.toISOString(), "2026-09-29T16:05:00.000Z");
});

test("a wall clock in standard time resolves at UTC-5", () => {
  // A World Series game 7 would fall on Oct 31, still EDT; December is not.
  const at = easternWallClockToUtc("2026-12-01T20:00");
  assert.equal(at?.toISOString(), "2026-12-02T01:00:00.000Z");
});

test("the postseason's own DST change is handled", () => {
  // Clocks go back on Nov 1, 2026. Same wall-clock hour, different offset.
  const before = easternWallClockToUtc("2026-10-31T20:00");
  const after = easternWallClockToUtc("2026-11-02T20:00");
  assert.equal(before?.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(after?.toISOString(), "2026-11-03T01:00:00.000Z");
});

test("a bad value is rejected rather than guessed at", () => {
  // Date's parser reads "not a date:00Z" as the year 2000 rather than
  // failing, so the format is checked before it gets there.
  assert.equal(easternWallClockToUtc("not a date"), null);
  assert.equal(easternWallClockToUtc(""), null);
  assert.equal(easternWallClockToUtc("2026-09-29"), null);
  assert.equal(easternWallClockToUtc("2026-13-45T99:99"), null);
});

test("the round trip through the form input is stable", () => {
  for (const wall of ["2026-09-29T12:05", "2026-10-31T20:00", "2026-12-01T20:00"]) {
    const at = easternWallClockToUtc(wall);
    assert.ok(at);
    assert.equal(utcToEasternWallClock(at), wall);
  }
});

test("the postseason boundary is midnight Eastern on the first day", () => {
  // First pitch is noon ET on Sept 29; the boundary is that morning, so a
  // game earlier that day still counts and one the night before does not.
  const firstPitch = new Date("2026-09-29T16:05:00Z");
  assert.equal(easternDayStart(firstPitch).toISOString(), "2026-09-29T04:00:00.000Z");
});

test("the boundary respects Eastern time, not UTC", () => {
  // A 10pm ET first pitch is already the next day in UTC; the boundary
  // still has to be the start of the Eastern day the game belongs to.
  const lateNight = new Date("2026-09-30T02:05:00Z");
  assert.equal(easternDayStart(lateNight).toISOString(), "2026-09-29T04:00:00.000Z");
});
