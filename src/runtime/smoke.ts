/**
 * A standalone check that the transport works, with no Stream Deck involved.
 *
 * `plugin.js` calls `streamDeck.connect()` and expects the websocket arguments Stream Deck passes
 * it, so it cannot be run by hand. This entry exercises the SAME mailslot module the plugin uses,
 * which is the part that can actually be wrong on a given machine.
 *
 *   node bin/smoke.js            # recentre
 *   node bin/smoke.js "AMS2"     # recentre, then switch the overlay to that tab
 *
 * OpenKneeboard must be RUNNING: the mailslot lives in the NT object namespace and disappears with
 * it. A failure here is a transport failure. A SUCCESS here is not proof the overlay moved — the
 * channel is one-way and unreadable, so only your eyes can confirm the second half.
 */

import { recenterVr, setTabByName } from "../protocol.ts";
import { createMailslotSender } from "./mailslot.ts";

const tab = process.argv[2];
const sender = createMailslotSender();

try {
  const recentred = sender.send(recenterVr());
  console.log(recentred ? "sent RECENTER_VR" : "FAILED to send RECENTER_VR (is OpenKneeboard running?)");
  if (tab) {
    const switched = sender.send(setTabByName(tab));
    console.log(switched ? `sent SetTabByName ${tab}` : `FAILED to send SetTabByName ${tab}`);
  }
  process.exitCode = recentred ? 0 : 1;
} finally {
  sender.close();
}
