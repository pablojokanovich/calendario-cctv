import assert from "node:assert/strict";
import test from "node:test";
import { createMonthScrollGesture } from "../lib/calendar-scroll.ts";

test("month scroll preserves normal page scrolling away from calendar boundaries", () => {
  const gesture = createMonthScrollGesture();
  assert.deepEqual(gesture(500, false, false, 0), { month: 0, consume: false });
  assert.deepEqual(gesture(-500, false, true, 20), { month: 0, consume: false });
  assert.deepEqual(gesture(500, true, false, 40), { month: 0, consume: false });
  assert.deepEqual(gesture(0, true, true, 60), { month: 0, consume: false });
});

test("scroll changes months only after deliberate movement at the relevant boundary", () => {
  const gesture = createMonthScrollGesture();
  assert.deepEqual(gesture(50, false, true, 0), { month: 0, consume: true });
  assert.deepEqual(gesture(60, false, true, 80), { month: 1, consume: true });
  assert.deepEqual(gesture(-120, true, false, 1000), { month: -1, consume: true });
});

test("trackpad momentum is locked until both cooldown and a gesture pause", () => {
  const gesture = createMonthScrollGesture();
  assert.equal(gesture(120, false, true, 0).month, 1);
  for (let time = 100; time <= 1500; time += 100) assert.equal(gesture(120, true, true, time).month, 0);
  assert.equal(gesture(120, false, true, 1900).month, 1);
});

test("opposite directions and pauses reset accumulated movement", () => {
  const gesture = createMonthScrollGesture();
  assert.equal(gesture(60, true, true, 0).month, 0);
  assert.equal(gesture(-60, true, true, 30).month, 0);
  assert.equal(gesture(-60, true, true, 400).month, 0);
  assert.equal(gesture(-40, true, true, 450).month, -1);
});
