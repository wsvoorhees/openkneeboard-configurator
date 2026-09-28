/**
 * The Windows half: open OpenKneeboard's mailslot and write packets to it.
 *
 * WHY koffi rather than plain Node, settled by probe on 2026-09-20 against OpenKneeboard 1.12.10
 * and Stream Deck's own Node 20.20.0 runtime:
 *
 *   fs.openSync(path, "w")                  -> UNKNOWN   (string flags imply CREATE_ALWAYS)
 *   fs.openSync(path, "r+")                 -> UNKNOWN   (a client may not request read access)
 *   fs.openSync(path, fs.constants.O_WRONLY)-> UNKNOWN   <- the design doc predicted this WOULD work
 *   CreateFileW via koffi                   -> ok, 47 bytes written
 *
 * A bogus mailslot path fails ENOENT / win32 2 while the real one fails UNKNOWN, so the path is
 * found and libuv simply cannot open this kind of object — it is not a missing-mailslot error.
 * Node's fs layer is out; the FFI call is the floor.
 *
 * The native transport runs only on Windows. The protocol and placement logic are tested
 * separately on Linux and Windows.
 */

import koffi from "koffi";

const MAILSLOT = "\\\\.\\mailslot\\com.openkneeboard.events.v1.3";

const GENERIC_WRITE = 0x40000000;
const FILE_SHARE_READ = 0x00000001;
const OPEN_EXISTING = 3;
const INVALID_HANDLE = 0xffffffffffffffffn;

const k32 = koffi.load("kernel32.dll");
const CreateFileW = k32.func(
  "void* __stdcall CreateFileW(str16, uint32, uint32, void*, uint32, uint32, void*)",
);
const WriteFile = k32.func("bool __stdcall WriteFile(void*, void*, uint32, _Out_ uint32*, void*)");
const CloseHandle = k32.func("bool __stdcall CloseHandle(void*)");
const GetLastError = k32.func("uint32 __stdcall GetLastError()");

export interface Sender {
  /** Returns true when the packet was written. Never throws: a dial tick that cannot reach a
   * closed OpenKneeboard is not worth crashing a plugin the rest of the deck depends on. */
  send(packet: string): boolean;
  close(): void;
}

/**
 * A resident sender. The plugin is already a long-lived process, so the handle is opened once and
 * held — that is the whole reason this lives in the plugin rather than in a per-press executable.
 *
 * The handle goes stale whenever OpenKneeboard exits (the mailslot lives in the NT object namespace
 * and disappears with it), so a failed write drops the handle and retries once. Reopening is how a
 * dial keeps working after OpenKneeboard restarts mid-session.
 */
export function createMailslotSender(path: string = MAILSLOT): Sender {
  let handle: unknown;

  const open = (): boolean => {
    const h = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, null, OPEN_EXISTING, 0, null);
    const address = koffi.address(h);
    if (address === 0n || address === INVALID_HANDLE) return false;
    handle = h;
    return true;
  };

  const drop = (): void => {
    if (handle !== undefined) {
      try { CloseHandle(handle); } catch { /* the object is already gone */ }
      handle = undefined;
    }
  };

  const writeOnce = (buffer: Buffer): boolean => {
    if (handle === undefined && !open()) return false;
    const written = [0];
    const ok = WriteFile(handle, buffer, buffer.length, written, null);
    // A mailslot write is all-or-nothing per message, so a short write is a failure, not a partial
    // send to resume — reporting it as success would be the silent-no-op shape again.
    return Boolean(ok) && written[0] === buffer.length;
  };

  return {
    send(packet: string): boolean {
      const buffer = Buffer.from(packet, "utf8");
      if (writeOnce(buffer)) return true;
      drop();
      return writeOnce(buffer);
    },
    close: drop,
  };
}

/** Surfaced for diagnostics; the Win32 code is more use than a thrown Error with no number in it. */
export const lastWin32Error = (): number => GetLastError();
