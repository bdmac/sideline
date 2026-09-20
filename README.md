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
3. Select a formation, assign starters, and confirm the bench. U8 defaults to two 25-minute halves, with four 10-minute quarters or two 20-minute halves available in setup. U12 uses two 30-minute halves.
4. Start or pause the clock from the sticky game controls.
5. Open **Create plan**, choose the number of swaps, review or override the fair suggestions, and confirm the OUT/IN checklist.
6. Tap a live pitch card or an **On field** player row to open that player's **Plan out** picker directly. Use the **On field** row's **Change positions** or **Take out of game** controls for other actions; dragging between pitch positions still changes positions without recording a substitution.
7. Undo the latest confirmed substitution/unavailable event when needed.
8. End the game only after confirming the destructive action.

Choose a local coach profile on first use. Brian can access both teams; Chris and Scott go directly to Fireballers, while Lindsey goes directly to Golden Dragons. The header shows the current coach’s name; use that control to change coaches. This is a device-local team filter, not password authentication.

An interrupted active game reopens automatically for an assigned persisted coach. The live timestamp and accumulated time recover from the last persisted state, and signing out never clears the game.

U8 also remembers one game's kickoff lineup on this device. Automatic starter selection gives players who began that game on the bench a modest boost; position preferences and your manual choices still matter. The record updates at the next U8 kickoff, not during substitutions or setup, and does not affect U12.

The header settings menu can keep the screen awake during an active visible game and play a chime plus supported vibration when a substitution reminder becomes due. Both features are optional and depend on browser/device capabilities.

Drag a live bench player onto a field player to send that substitution immediately. On touchscreens, hold briefly (125ms) before dragging; phones show a temporary pitch so you do not have to scroll while holding a player. Release away from a player to cancel. Tapping a row still opens the keyboard-accessible planner, and Bench / On field tabs use taps rather than swipes.

With no bench players available, tapping a pitch card explains that a player must be added or returned before making a substitution. Position changes and player removal remain available in **On field**, and pitch dragging still works.

Immediate swaps and taking a player out leave the team rotation timer running toward its existing deadline. Only sending a planned rotation, including a partial batch, restarts that interval. Each player's playing and bench times still update for every change.

If a linked keeper move is already planned, focused pickers mark its reserved players and explain conflicts beside **Edit keeper plan** after selection. Ordinary replacements in a full plan use **Replace planned swap**, rather than Add to plan. **Sub now** or a bench drop asks before overriding a saved keeper handoff and recalculating the remaining plan.

Playing-time notices flag accumulating shortfalls for regular players and guests, accounting for late arrival and time out of the game. They remain visible when a player is queued or on the field, become more urgent as catch-up time runs short, and link directly to planning or review. Late-game alerts and the End game confirmation allow up to one minute below the accrued minimum, so small differences hidden by rounded times do not trigger warnings. Larger deficits still appear; you can continue playing or explicitly finish if the match is over.

For testing or demos, enable **Settings → Demo mode**. During an active game, the expanded match header gains a fast-forward button that opens **Fast-forward**. Enter a positive number of minutes to add while advancing current field and bench time through the normal accounting path. The clock pauses automatically after the jump and leaves period transitions manual.

### Reproduce a linked keeper move locally

Run `npm run dev -- --host 127.0.0.1 --port 5185 --strictPort`, then open `http://127.0.0.1:5185/src/test/keeper-handoff-preview.html`. On a fresh preview origin, it loads a paused U8 game with five players on the bench and four queued substitutions, including Henry moving from Left Mid to Keeper. Tap Henry or **Review plan**, then **Edit plan** to see why 5 is disabled. Nothing is executed until **Send players in**.

This development-only fixture refuses to overwrite existing Sideline data. If that port already has saved data, open its existing game or use another unused port. The fixture page is not included in the production build.

## Data

Game data is stored in `localStorage` under `sideline-state-v1`. Device-local color mode is stored under `sideline-color-mode`, and game-day settings are stored under `sideline-device-preferences`. There is no backend or authentication. Clearing browser site data removes all Sideline data and preferences.
