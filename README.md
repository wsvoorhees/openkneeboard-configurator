# OpenKneeboard Configurator

A Windows Stream Deck plugin for controlling OpenKneeboard from keys and dials. It can switch tabs and profiles, recenter VR, nudge a view's placement and size, toggle one view, and fade one view. Each action has an offline property inspector for its settings. The plugin includes its own icons and build files.

Its visible name and category are **OpenKneeboard Configurator**, and its plugin ID is `com.willvoorhees.openkneeboard-configurator`. Profiles using the earlier plugin identifier need their actions re-added after installation; Stream Deck identifies actions by their plugin and action IDs.

## Artwork

The icons in `imgs/actions/` are the plugin's bundled defaults, shown in Stream Deck's action list and on newly added actions. Stream Deck profiles can override the image on each key or dial. The existing rig uses those overrides, so its key faces differ from the bundled defaults.

The package also includes 14 images verified against the installed profiles in `imgs/profile/`: the original steering wheel and icons based on Google's Material set. Their source SVGs and image hashes are in `artwork-source/`; the Material license is in the plugin's `licenses/` folder. Six other images in the current profile came from the Lovely Sim Racing icon pack and are deliberately absent from this public repository. The plugin does not require that pack to build, install, or run.

## OpenKneeboard compatibility

| Action | OpenKneeboard requirement |
| --- | --- |
| Tab switching, profile switching, recenter VR | 1.12.10 or newer |
| VR placement and size dials | A build containing merged [PR #937](https://github.com/OpenKneeboard/OpenKneeboard/pull/937). Release 1.12.10 predates it. |
| Toggle one view | A build containing [draft PR #939](https://github.com/OpenKneeboard/OpenKneeboard/pull/939). |
| Fade one view | A build containing [draft PR #940](https://github.com/OpenKneeboard/OpenKneeboard/pull/940). |

The API uses a one-way Windows mailslot. A successful write confirms delivery to OpenKneeboard, not that the requested change was applied. Unsupported messages are ignored by older builds.

## Configure actions

Add an action from the **OpenKneeboard Configurator** category in Stream Deck, select it, enter its settings in the property inspector, and press **Save**. Tab and profile names must exactly match names in OpenKneeboard. View numbers start at 1; 0 means the active view where supported.

- **Overlay Control:** choose a deck tab, a reference tab and view, and optionally an OpenKneeboard profile. Press to show the reference panel.
- **Placement Dial:** choose an axis index (0–5 for X, EyeY, Z, RX, RY, RZ), or enable size control. Turn to nudge; press the dial to switch between coarse and fine steps. A key can send a configured signed step.
- **Select View:** point the placement dials at a view.
- **Toggle View:** show or hide one view.
- **Fade View:** adjust the selected view's opacity with a key or dial.
- **Reset Position:** undo placement changes accumulated since entering the placement page.
- **Recentre VR:** recenter the VR overlay.

Placement controls work best on a dedicated Stream Deck page. Create `Placement` and `Placement Fine` tabs in OpenKneeboard if you want the page switch to show step-size references; otherwise set those fields to your own tab titles. The plugin does not create tabs or Stream Deck profiles.

## Build and install

Use Node.js 20 or newer. Build and install on **Windows**, because `koffi` selects a native Windows binary when `npm ci` runs there. Quit Stream Deck from its tray icon before installing.

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run validate
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Copy
```

`install.ps1` stages the source in a native Windows build directory, so it also works when the checkout is in WSL and PowerShell sees it through a UNC path. Omit `-Copy` to link the build directory into Stream Deck's Plugins folder; that requires Windows Developer Mode or elevation. The script refuses to install while Stream Deck is running to avoid partially replacing its locked native binary.

To make a distributable `.streamDeckPlugin` file on Windows:

```powershell
npm ci
npm run pack
```

`pack` builds the JavaScript, copies both `koffi` and its Windows x64 native binary into the plugin, validates the manifest and assets, then writes the installer under `dist/`. The compiled plugin includes all UI and icons. Run `npm run generate:icons` only when changing the original vector artwork in `scripts/generate-icons.mjs`; generated images are committed.

## Diagnostics

With OpenKneeboard running, the built `bin/smoke.js` sends a tab-switch packet:

```powershell
$plugin = Get-ChildItem -Directory -Filter '*.sdPlugin' | Select-Object -First 1
node (Join-Path $plugin.FullName 'bin/smoke.js') AMS2
```

Replace `AMS2` with an existing tab title. If OpenKneeboard is closed, the smoke test should fail. Logs from the installed plugin live in its `logs/` folder under `%APPDATA%\Elgato\StreamDeck\Plugins\`.

## Source layout

- `src/protocol.ts`, `placement.ts`, `dispatch.ts`, `pages.ts`: pure logic tested on Linux and Windows.
- `src/runtime/`: Stream Deck actions, the mailslot sender, and process state.
- `*.sdPlugin/manifest.json`, `ui/`, `imgs/`: the installable plugin's metadata, offline settings UI, and original bundled artwork.
- `scripts/generate-icons.mjs`: reproducible source for every manifest image; no third-party art is required.
