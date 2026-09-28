import {
  action,
  SingletonAction,
  streamDeck,
  type DialDownEvent,
  type DialRotateEvent,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";

import { placementFeedback } from "../feedback.ts";
import { DEFAULT_VIEW_SIZE, OPACITY_STEP, resetDelta, resize, rotate, setTarget, toggleMode,
  validSize } from "../placement.ts";
import { recenterVr } from "../protocol.ts";
import {
  getPlacement,
  showView,
  showTabOnView,
  send,
  sendNudge,
  setPlacement,
  fadeView,
  showProfile,
  pageAppeared,
} from "./session.ts";

const UUID = "com.will-voorhees.phoenix-openkneeboard";

export type OverlayControlSettings = {
  /** Which view holds the wheel reference; short press toggles its visibility. */
  wheelView?: number;
  /** Tab titles, which SetTabByName matches exactly. */
  deckTab?: string;
  wheelTab?: string;
  /**
   * The OpenKneeboard profile this deck profile belongs with, asserted when the key appears.
   *
   * This is what makes the overlay follow the game: an OpenKneeboard profile carries both the tab
   * list and the panel placement, so switching it is how the right deck map appears in the right
   * place. Unset, the key does nothing on appear — a deck profile with no overlay counterpart.
   */
  kneeboardProfile?: string;
};

/**
 * (1,0) on the keypad — the one position verified bound in zero of six games.
 *
 * Press toggles the wheel reference. Native Go to Page on the former warp placeholder enters
 * placement; plugin profile switching cannot address imported user profiles.
 */
@action({ UUID: `${UUID}.overlay-control` })
export class OverlayControl extends SingletonAction<OverlayControlSettings> {
  #showWheel(settings: OverlayControlSettings): void {
    // Assign the wheel tab before showing the separate panel. Visibility is toggled by
    // OpenKneeboard, whose state the one-way channel cannot read back.
    if (settings.wheelTab) showTabOnView(settings.wheelTab, settings.wheelView ?? 2);
    showView(settings.wheelView ?? 2);
  }

  /**
   * Report this game's deck page — its deck map and its OpenKneeboard profile — to the page
   * coordinator whenever this key becomes visible.
   *
   * `onWillAppear` is the only signal the plugin gets that a deck profile has been switched to —
   * Stream Deck has no "profile activated" event — and this key is emitted into every game's
   * profile, so it is the one that always fires. It also covers the deck reconnecting and the
   * plugin restarting. The same key sits on the placement page; there the coordinator sees the
   * placement controls in the same batch and shows the placement reference instead.
   *
   * What it does NOT cover: OpenKneeboard being started while the deck is already sitting on a
   * game. Nothing appears at that moment, so nothing re-asserts, and the channel is one-way so the
   * plugin cannot notice it came up. The overlay stays on whatever profile it loaded until the deck
   * profile or page changes. `onKeyDown` re-asserts for that reason — pressing the key you would
   * reach for anyway is the cheapest resync available.
   */
  override onWillAppear(ev: WillAppearEvent<OverlayControlSettings>): void {
    const settings = ev.payload.settings ?? {};
    pageAppeared(ev.action.device.id, { page: "deck", deckTab: settings.deckTab ?? "", profile: settings.kneeboardProfile });
  }

  override onKeyDown(ev: KeyDownEvent<OverlayControlSettings>): void {
    // Re-assert before acting. If OpenKneeboard started after the deck was already on this game,
    // this is the first moment the plugin can put it on the right profile — and the press is about
    // to ask it for a view or a tab that only the right profile has.
    const profile = ev.payload.settings?.kneeboardProfile;
    if (profile) showProfile(profile);
    this.#showWheel(ev.payload.settings ?? {});
  }
}

export type PlacementDialSettings = {
  /** 0-5 → X / EyeY / Z / RX / RY / RZ. Falls back to the dial's own column. */
  dialIndex?: number;
  direction?: number;
  /** The two generated placement references. Pressing a dial switches between them, which is how
   * the live step size becomes visible in a headset — a static page cannot show a changing state,
   * and the deck's own labels are on a device you cannot look at. */
  coarseTab?: string;
  fineTab?: string;
  /** Dial 1 scales the selected view's physical size instead of moving EyeY. */
  size?: boolean;
  sizes?: Record<string, Record<string, number>>;
};

/** A placement-page dial. Turn nudges its axis; press toggles coarse/fine for ALL of them. */
@action({ UUID: `${UUID}.placement-dial` })
export class PlacementDial extends SingletonAction<PlacementDialSettings> {
  #index(ev: { action: { coordinates?: { column: number } }; payload: { settings?: PlacementDialSettings } }): number {
    return ev.payload.settings?.dialIndex ?? ev.action.coordinates?.column ?? 0;
  }

  override async onWillAppear(ev: WillAppearEvent<PlacementDialSettings>): Promise<void> {
    pageAppeared(ev.action.device.id, { page: "placement", tab: ev.payload.settings?.coarseTab });
    if (!ev.action.isDial()) return;
    const feedback = placementFeedback(this.#index(ev));
    if (!feedback) return;
    // Encoder touch strips have their own feedback layout. `States[].Image` only supplies the
    // action image; it does not populate this layout's `icon` pixmap.
    await ev.action.setFeedbackLayout("$X1");
    await ev.action.setFeedback({ title: feedback.title, icon: feedback.icon });
  }

  override onDialRotate(ev: DialRotateEvent<PlacementDialSettings>): void {
    const before = getPlacement();
    const settings = ev.payload.settings;
    const candidate = settings?.sizes?.[String(before.target)];
    const base = validSize(candidate) ? candidate : DEFAULT_VIEW_SIZE;
    const { nudge, state } = settings?.size
      ? resize(before, ev.payload.ticks, base)
      : rotate(before, this.#index(ev), ev.payload.ticks);
    setPlacement(state);
    sendNudge(nudge, before.target);
  }

  override onKeyDown(ev: KeyDownEvent<PlacementDialSettings>): void {
    const before = getPlacement();
    const { nudge, state } = rotate(before, this.#index(ev), ev.payload.settings?.direction ?? 0);
    setPlacement(state);
    sendNudge(nudge, before.target);
  }

  override onDialDown(ev: DialDownEvent<PlacementDialSettings>): void {
    // Coarse/fine is global, not per dial: six dials each in their own mode is a state nobody can
    // hold in their head while driving.
    const next = toggleMode(getPlacement());
    setPlacement(next);
    const settings = ev.payload.settings ?? {};
    showTabOnView(next.mode === "fine" ? (settings.fineTab ?? "Placement Fine") : (settings.coarseTab ?? "Placement"), 1);
  }
}

export type ViewKeySettings = {
  /** The `Kneeboard` index this key acts on: 1-based, 0 meaning whichever view is active. */
  view?: number;
};

/**
 * Point the dials at a view.
 *
 * With more than one panel, "move the kneeboard" is ambiguous. This is the deliberate, visible
 * answer to which one — the alternative was inferring it from whichever panel was last touched,
 * which is a rule nobody can hold in their head with a headset on.
 */
@action({ UUID: `${UUID}.view-select` })
export class ViewSelect extends SingletonAction<ViewKeySettings> {
  override onWillAppear(ev: WillAppearEvent<ViewKeySettings>): void {
    pageAppeared(ev.action.device.id, { page: "placement" });
  }
  override onKeyDown(ev: KeyDownEvent<ViewKeySettings>): void {
    const view = ev.payload.settings?.view ?? 1;
    setPlacement(setTarget(getPlacement(), view));
    streamDeck.logger.info(`dials now move view ${view}`);
  }
}

/**
 * Show or hide one view.
 *
 * Always a toggle, never a remembered state: the mailslot is one-way, so the plugin cannot read
 * back whether a panel is up. Letting OpenKneeboard do the toggling keeps the truth in the one
 * place that has it.
 */
@action({ UUID: `${UUID}.view-visibility` })
export class ViewVisibility extends SingletonAction<ViewKeySettings> {
  override onWillAppear(ev: WillAppearEvent<ViewKeySettings>): void {
    pageAppeared(ev.action.device.id, { page: "placement" });
  }
  override onKeyDown(ev: KeyDownEvent<ViewKeySettings>): void {
    const view = ev.payload.settings?.view ?? 1;
    showView(view);
    streamDeck.logger.info(`toggled visibility of view ${view}`);
  }
}

export type ViewOpacitySettings = {
  /** Which view to fade. Omitted, the key follows whichever view `Move n` last selected. */
  view?: number;
  /** Signed step. Negative fades out; OpenKneeboard clamps to 0..1 at both ends. */
  step?: number;
};

/**
 * Fade the selected view up or down.
 *
 * It follows the SAME selection the dials use rather than carrying its own view number, so
 * `Move 2` then fade means what it looks like. A key with an explicit `view` overrides that, which
 * is what a fixed "dim the wheel" key would want.
 */
@action({ UUID: `${UUID}.view-opacity` })
export class ViewOpacity extends SingletonAction<ViewOpacitySettings> {
  override async onWillAppear(ev: WillAppearEvent<ViewOpacitySettings>): Promise<void> {
    pageAppeared(ev.action.device.id, { page: "placement" });
    if (!ev.action.isDial()) return;
    const feedback = placementFeedback(0)!;
    await ev.action.setFeedbackLayout("$X1");
    await ev.action.setFeedback({ title: feedback.title, icon: feedback.icon });
  }
  override onKeyDown(ev: KeyDownEvent<ViewOpacitySettings>): void {
    const settings = ev.payload.settings ?? {};
    const view = settings.view ?? getPlacement().target;
    const step = settings.step ?? -OPACITY_STEP;
    fadeView(view, step);
    streamDeck.logger.info(`faded view ${view} by ${step}`);
  }
  override onDialRotate(ev: DialRotateEvent<ViewOpacitySettings>): void {
    const view = ev.payload.settings?.view ?? getPlacement().target;
    fadeView(view, ev.payload.ticks * OPACITY_STEP);
  }
}

/** Undo everything this session moved. Relative-only API, so this is the only "reset" possible. */
@action({ UUID: `${UUID}.placement-reset` })
export class PlacementReset extends SingletonAction {
  override onWillAppear(ev: WillAppearEvent): void {
    pageAppeared(ev.action.device.id, { page: "placement" });
  }
  override onKeyDown(): void {
    const before = getPlacement();
    const { nudge, state } = resetDelta(before);
    setPlacement(state);
    sendNudge(nudge, before.target);
  }
}

/** Recenter, which works against the shipped release and needs no PR. */
@action({ UUID: `${UUID}.recentre` })
export class Recentre extends SingletonAction {
  override onKeyDown(): void {
    send(recenterVr());
  }
}
