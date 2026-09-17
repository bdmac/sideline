# Sideline

Sideline is an installable, offline-capable React web app for managing fair playing time and substitutions for a U8 5v5 team and a U12 9v9 team. It stores all rosters, preferences, and the active game locally in the browser.

**Live app:** https://bdmac.github.io/sideline/

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To test installation and offline behavior using a production build:

```bash
npm run build
npm run preview
```

Use **Install Sideline** on the coach selection screen. Supported browsers open their native installation prompt. On iPhone or iPad, open the app in Safari, tap **Share**, then choose **Add to Home Screen**. Service workers require `localhost` or HTTPS.

## Quality commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## How to use

1. Choose U8 or U12. Team state is deliberately isolated.
2. Start a game and mark attendance from the fixed team roster.
3. Select a formation, assign starters, and confirm the bench. U8 games can use quarters or halves; U12 uses its fixed two-half format.
4. Start or pause the clock from the sticky game controls.
5. Open **Plan subs**, choose the number of swaps, review or override the fair suggestions, and confirm the OUT/IN checklist.
6. Use **Positions** to swap field positions without recording a substitution, or mark a player unavailable.
7. Undo the latest confirmed substitution/unavailable event when needed.
8. End the game only after confirming the destructive action.

Choose a local coach profile on first use. Brian can access both teams; Chris and Scott go directly to Fireballers, while Lindsey goes directly to Golden Dragons. The header shows the current coach’s name; use that control to change coaches. This is a device-local team filter, not password authentication.

An interrupted active game reopens automatically for an assigned persisted coach. The live timestamp and accumulated time recover from the last persisted state, and signing out never clears the game.

U8 also remembers one game's kickoff lineup on this device. Automatic starter selection gives players who began that game on the bench a modest boost; position preferences and your manual choices still matter. The record updates at the next U8 kickoff, not during substitutions or setup, and does not affect U12.

The header settings menu can keep the screen awake during an active visible game and play a chime plus supported vibration when a substitution reminder becomes due. Both features are optional and depend on browser/device capabilities.

Drag a live bench player onto a field player to send that substitution immediately. On touchscreens, hold briefly (125ms) before dragging; phones show a temporary pitch so you do not have to scroll while holding a player. Release away from a player to cancel. Tapping a row still opens the keyboard-accessible planner, and Bench / On field tabs use taps rather than swipes.

Immediate swaps and taking a player out leave the team rotation timer running toward its existing deadline. Only sending a planned rotation, including a partial batch, restarts that interval. Each player's playing and bench times still update for every change.

For testing or demos, enable **Settings → Demo mode**. During an active game, the expanded match header gains a fast-forward button that opens **Fast-forward**. Enter a positive number of minutes to add while advancing current field and bench time through the normal accounting path. The clock pauses automatically after the jump and leaves period transitions manual.

## Data

Game data is stored in `localStorage` under `sideline-state-v1`. Device-local color mode is stored under `sideline-color-mode`, and game-day settings are stored under `sideline-device-preferences`. There is no backend or authentication. Clearing browser site data removes all Sideline data and preferences.
