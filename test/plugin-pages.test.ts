import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_SETTLE_MS,
  PLACEMENT_TAB,
  createPageCoordinator,
  resolvePage,
  type PageClock,
  type PageEffects,
  type PageSignal,
} from "../src/pages.ts";

/** A clock the test drives by hand: the settle window costs no wall time, and a timer that never
 * fires is visible rather than merely slow. */
function fakeClock() {
  const pending: { handler: () => void; ms: number }[] = [];
  const clock: PageClock = {
    setTimeout(handler, ms) {
      pending.push({ handler, ms });
      return pending.length;
    },
  };
  return {
    clock,
    armed: () => pending.map((p) => p.ms),
    fireAll() {
      const due = pending.splice(0);
      assert.ok(due.length > 0, "expected a settle timer to be armed");
      for (const d of due) d.handler();
    },
  };
}

function harness() {
  const applied: { device: string; effects: PageEffects }[] = [];
  const timer = fakeClock();
  const pages = createPageCoordinator({
    apply: (device, effects) => applied.push({ device, effects }),
    clock: timer.clock,
  });
  return { pages, applied, timer };
}

const deckKey: PageSignal = { page: "deck", deckTab: "AMS2", profile: "AMS2" };
const placementDial: PageSignal = { page: "placement" };

test("the deck page shows its deck map and asserts its overlay profile", () => {
  assert.deepEqual(resolvePage([deckKey]), { tab: "AMS2", profile: "AMS2", enteredPlacement: false });
});

test("any placement action makes the batch the placement page, whatever else appeared", () => {
  // The collision this module exists to remove: the placement page carries a copy of Wheel Ref,
  // whose deck-page behaviour would put the deck map on view 1 as the page appears — the same
  // moment the placement dials put the placement reference there. One decision, not two senders.
  const effects = resolvePage([deckKey, placementDial, { page: "placement" }]);
  assert.deepEqual(effects, { tab: PLACEMENT_TAB, profile: "AMS2", enteredPlacement: true });
});

test("arrival order cannot change the outcome", () => {
  // The old per-action handlers raced: whichever send landed last won view 1. Every ordering of
  // the same page must now resolve identically.
  const signals: PageSignal[] = [deckKey, placementDial, { page: "placement", tab: "Placement" }];
  const permutations = (xs: PageSignal[]): PageSignal[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  const outcomes = new Set(permutations(signals).map((order) => JSON.stringify(resolvePage(order))));
  assert.equal(outcomes.size, 1, `orderings disagreed: ${[...outcomes].join(" | ")}`);
});

test("a placement page without Wheel Ref asserts no profile rather than a guessed one", () => {
  assert.deepEqual(resolvePage([placementDial]), { tab: PLACEMENT_TAB, profile: undefined, enteredPlacement: true });
  assert.equal(resolvePage([]), undefined, "an empty batch decides nothing");
});

test("the placement page honours a generated reference title", () => {
  assert.equal(resolvePage([{ page: "placement", tab: "Placement Coarse" }])!.tab, "Placement Coarse");
});

test("one page change applies once, after the settle window, per device", () => {
  const { pages, applied, timer } = harness();
  pages.appeared("deck-A", deckKey);
  pages.appeared("deck-A", placementDial);
  pages.appeared("deck-A", placementDial);
  assert.deepEqual(timer.armed(), [PAGE_SETTLE_MS], "one timer for the batch, not one per signal");
  assert.equal(applied.length, 0, "nothing is sent before the page has settled");
  timer.fireAll();
  assert.deepEqual(applied, [{ device: "deck-A", effects: { tab: PLACEMENT_TAB, profile: "AMS2", enteredPlacement: true } }]);

  // Done: the deck page appears again, as a new batch.
  pages.appeared("deck-A", deckKey);
  timer.fireAll();
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[1]!.effects, { tab: "AMS2", profile: "AMS2", enteredPlacement: false });
});

test("two devices settle independently", () => {
  const { pages, applied, timer } = harness();
  pages.appeared("deck-A", deckKey);
  pages.appeared("deck-B", placementDial);
  assert.equal(timer.armed().length, 2);
  timer.fireAll();
  assert.deepEqual(applied.map((a) => [a.device, a.effects.enteredPlacement]).sort(), [["deck-A", false], ["deck-B", true]]);
});
