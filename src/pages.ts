/**
 * Which page is up, decided once.
 *
 * Stream Deck gives a plugin no "page changed" or "profile switched" event. The only evidence is
 * `willAppear` on the plugin's own actions, which fires for every one of them on the page that just
 * came up. Each action used to act on that alone — Wheel Ref put the deck map on view 1, the opacity
 * dial put the placement reference there — so one page change produced several sends for the same
 * view, and whichever landed last won. Putting a Wheel Ref copy on the placement page (2026-09-22)
 * made that a live race, patched with a per-key "don't assert on appear" flag.
 *
 * This removes the race instead. Every appearing action reports which page it belongs to; the
 * reports from one page change are gathered for a short settle window and resolved into ONE set of
 * effects. A batch containing any placement-page action is the placement page, so a Wheel Ref on
 * that page needs no special settings — it is the same key on both pages.
 *
 * Pure: the clock is injected, as in `dispatch.ts`, so the settle window is tested without sleeping.
 */

/** Long enough to collect one page's appear events, which arrive back to back; short enough to be
 * imperceptible next to the page change itself. */
export const PAGE_SETTLE_MS = 50;

/** The placement reference's tab title, which `vr --all` and the OpenKneeboard profiles agree on. */
export const PLACEMENT_TAB = "Placement";

/** What one appearing action says about the page it is on. */
export type PageSignal =
  /** Wheel Ref: this game's deck map, and the OpenKneeboard profile that belongs with it. */
  | { page: "deck"; deckTab: string; profile?: string }
  /** Any placement-page control. `tab` lets a generated reference title override the default. */
  | { page: "placement"; tab?: string };

export interface PageEffects {
  /** The tab view 1 should show. */
  tab: string;
  /** The OpenKneeboard profile to assert, if any action on the page named one. */
  profile: string | undefined;
  /** True when moving from the deck page into placement. */
  enteredPlacement: boolean;
}

/** Resolve one page change. Order-independent by construction: it reads the set, not the sequence. */
export function resolvePage(signals: readonly PageSignal[]): PageEffects | undefined {
  if (signals.length === 0) return undefined;
  const profile = signals.find((s): s is Extract<PageSignal, { page: "deck" }> => s.page === "deck" && !!s.profile)?.profile;
  const placement = signals.filter((s): s is Extract<PageSignal, { page: "placement" }> => s.page === "placement");
  if (placement.length > 0) {
    return { tab: placement.find((s) => s.tab)?.tab ?? PLACEMENT_TAB, profile, enteredPlacement: true };
  }
  const deck = signals.find((s): s is Extract<PageSignal, { page: "deck" }> => s.page === "deck")!;
  return { tab: deck.deckTab, profile, enteredPlacement: false };
}

export interface PageClock {
  setTimeout(handler: () => void, ms: number): unknown;
}

const systemClock: PageClock = { setTimeout: (handler, ms) => setTimeout(handler, ms) };

export interface PageCoordinator {
  /** An action appeared on `device`'s current page. */
  appeared(device: string, signal: PageSignal): void;
}

/**
 * Batch appear signals per device and apply each page change once.
 *
 * The first signal of a batch arms the settle timer; later ones join it. Devices are independent —
 * a second deck changing page must not resolve against the first one's keys.
 */
export function createPageCoordinator(options: {
  apply: (device: string, effects: PageEffects) => void;
  settleMs?: number;
  clock?: PageClock;
}): PageCoordinator {
  const { apply, settleMs = PAGE_SETTLE_MS, clock = systemClock } = options;
  const batches = new Map<string, PageSignal[]>();
  const currentPage = new Map<string, "deck" | "placement">();
  const currentProfile = new Map<string, string>();

  return {
    appeared(device, signal) {
      const open = batches.get(device);
      if (open) {
        open.push(signal);
        return;
      }
      batches.set(device, [signal]);
      clock.setTimeout(() => {
        const signals = batches.get(device) ?? [];
        batches.delete(device);
        const effects = resolvePage(signals);
        if (effects) {
          const page = signals.some((s) => s.page === "placement") ? "placement" : "deck";
          const profileChanged = !!effects.profile && !!currentProfile.get(device) && currentProfile.get(device) !== effects.profile;
          apply(device, { ...effects,
            enteredPlacement: page === "placement" && (currentPage.get(device) !== "placement" || profileChanged) });
          currentPage.set(device, page);
          if (effects.profile) currentProfile.set(device, effects.profile);
        }
      }, settleMs);
    },
  };
}
