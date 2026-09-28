/**
 * One key, two gestures.
 *
 * The keypad has no room: `SIMRACING-CONTROL-LAYOUT.md` records that only the four corners are
 * findable without counting and all four are claimed, so `overlayControl` at (1,0) carries both the
 * wheel-reference toggle (short) and the placement mode (long).
 *
 * The clock is injected because the alternative is a test that sleeps 600ms to assert a 600ms
 * timeout, which is both slow and the kind of test that passes when the timer never fires at all.
 */

export const LONG_PRESS_MS = 600;

export interface PressClock {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: PressClock = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PressDispatcher {
  keyDown(): void;
  keyUp(): void;
}

/**
 * Standard long-press pattern: arm a timer on keyDown, run the long action if it fires, run the
 * short action on keyUp only if it did not.
 *
 * The long action fires on the TIMER, not on release — you find out you are in placement mode while
 * still holding the key, which in a headset is the only feedback that arrives in time to let go.
 */
export function createPressDispatcher(options: {
  onShort: () => void;
  onLong: () => void;
  longPressMs?: number;
  clock?: PressClock;
}): PressDispatcher {
  const { onShort, onLong, longPressMs = LONG_PRESS_MS, clock = systemClock } = options;

  let handle: unknown;
  let longFired = false;
  let down = false;

  return {
    keyDown(): void {
      // A repeat keyDown with no keyUp between (a stuck event, or the Stream Deck resending on
      // reconnect) must not arm a second timer that fires the long action twice.
      if (down) return;
      down = true;
      longFired = false;
      handle = clock.setTimeout(() => {
        longFired = true;
        handle = undefined;
        onLong();
      }, longPressMs);
    },

    keyUp(): void {
      // A keyUp we never saw the keyDown for is not a short press — it is the tail of someone
      // else's press, and firing the wheel toggle on it would be a surprise mid-lap.
      if (!down) return;
      down = false;
      if (handle !== undefined) {
        clock.clearTimeout(handle);
        handle = undefined;
      }
      if (!longFired) onShort();
    },
  };
}
