import test from "node:test";
import assert from "node:assert/strict";
import { LONG_PRESS_MS, createPressDispatcher, type PressClock } from "../src/dispatch.ts";

/** A clock the test drives by hand, so a 600ms timeout costs no wall time and a timer that never
 * fires is visible rather than merely slow. */
function fakeClock() {
  let pending: { handler: () => void; ms: number } | undefined;
  const clock: PressClock = {
    setTimeout(handler, ms) {
      pending = { handler, ms };
      return pending;
    },
    clearTimeout() {
      pending = undefined;
    },
  };
  return {
    clock,
    armedFor: () => pending?.ms,
    fire() {
      const due = pending;
      assert.ok(due, "expected a timer to be armed");
      pending = undefined;
      due.handler();
    },
  };
}

function harness(longPressMs = LONG_PRESS_MS) {
  const fired: string[] = [];
  const timer = fakeClock();
  const press = createPressDispatcher({
    onShort: () => fired.push("short"),
    onLong: () => fired.push("long"),
    longPressMs,
    clock: timer.clock,
  });
  return { press, fired, timer };
}

test("a release before the timer is a short press", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  assert.equal(timer.armedFor(), 600, "the long-press window is 600ms");
  press.keyUp();
  assert.deepEqual(fired, ["short"]);
});

test("the long action fires on the timer, while the key is still held", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  timer.fire();
  // Not on release: in a headset this is the only feedback that arrives in time to let go.
  assert.deepEqual(fired, ["long"]);
});

test("releasing after a long press does not also fire the short action", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  timer.fire();
  press.keyUp();
  assert.deepEqual(fired, ["long"], "a long press must not toggle the wheel reference on release");
});

test("a repeated keyDown does not arm a second timer or fire long twice", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  press.keyDown();
  timer.fire();
  press.keyUp();
  assert.deepEqual(fired, ["long"]);
});

test("a keyUp with no keyDown is ignored rather than read as a short press", () => {
  const { press, fired } = harness();
  press.keyUp();
  assert.deepEqual(fired, [], "the tail of someone else's press must not toggle anything mid-lap");
});

test("presses in sequence each dispatch once", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  press.keyUp();
  press.keyDown();
  timer.fire();
  press.keyUp();
  press.keyDown();
  press.keyUp();
  assert.deepEqual(fired, ["short", "long", "short"]);
});

test("a short press never leaves the long timer armed to fire later", () => {
  const { press, fired, timer } = harness();
  press.keyDown();
  press.keyUp();
  assert.equal(timer.armedFor(), undefined, "the timer must be cleared, not left pending");
  assert.deepEqual(fired, ["short"]);
});
