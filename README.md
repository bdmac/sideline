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

Use **Install Sideline** on the home screen. Supported browsers open their native installation prompt. On iPhone or iPad, open the app in Safari, tap **Share**, then choose **Add to Home Screen**. Service workers require `localhost` or HTTPS.

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

An interrupted active game reopens automatically. The live timestamp and accumulated time recover from the last persisted state.

## Data

Game data is stored in `localStorage` under `sideline-state-v1`, and the device-local color mode is stored under `sideline-color-mode`. There is no backend or authentication. Clearing browser site data removes all Sideline data and preferences.
