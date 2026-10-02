import { test } from "node:test";
import assert from "node:assert/strict";
import { easternDaysInRange } from "./espn";

test("lists every Eastern day from start to end, inclusive", () => {
  assert.deepEqual(
    easternDaysInRange(new Date("2026-09-29T04:00:00Z"), new Date("2026-10-02T16:00:00Z")),
    ["20260929", "20260930", "20261001", "20261002"],
  );
});

test("uses the Eastern date, not the UTC one, at both ends", () => {
  // 11pm Eastern on Sept 30 is already Oct 1 in UTC.
  assert.deepEqual(
    easternDaysInRange(new Date("2026-10-01T03:00:00Z"), new Date("2026-10-02T03:30:00Z")),
    ["20260930", "20261001"],
  );
});

test("crosses the end of daylight saving time", () => {
  assert.deepEqual(
    easternDaysInRange(new Date("2026-10-31T16:00:00Z"), new Date("2026-11-02T16:00:00Z")),
    ["20261031", "20261101", "20261102"],
  );
});

test("returns the start day alone when the range is within one day", () => {
  assert.deepEqual(
    easternDaysInRange(new Date("2026-10-05T14:00:00Z"), new Date("2026-10-05T20:00:00Z")),
    ["20261005"],
  );
});
