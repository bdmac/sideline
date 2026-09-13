# Sideline design system

## Direction

Sideline is a calm magnetic tactics board translated into an operational match sheet. It deliberately avoids the generic analytics dashboard: the primary hierarchy is team identity, game state, pitch, bench, and the next action.

The physical scene is a coach using a phone outdoors in daylight, often one-handed and under time pressure. The interface therefore uses pale surfaces, very dark text, explicit labels, large controls, and restrained color.

## Palette

| Token     | Value     | Role                                         |
| --------- | --------- | -------------------------------------------- |
| Ink       | `#10282c` | Primary text, rules, strong neutral controls |
| Paper     | `#fbfcf8` | Main surface                                 |
| Wash      | `#edf2ee` | Secondary surface and inactive state         |
| Turf      | `#0b6b63` | Primary action, current/active state         |
| Turf dark | `#074c48` | Hover and high-contrast turf text            |
| Turf pale | `#dbece7` | Selected backgrounds                         |
| Warm      | `#d45c27` | Substitution action only                     |
| Warm dark | `#9d3d19` | Warm-state text and hover                    |
| Danger    | `#a12f2f` | Destructive end action                       |
| Focus     | `#0066cc` | Visible keyboard focus                       |

Color never communicates state alone. Text such as “Present,” “Clock paused,” “OUT,” and “IN” remains visible.

## Typography

Use one practical system sans stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Headings use compact negative tracking and heavy weights. Timers use tabular numerals. Labels remain sentence case; small uppercase is reserved for position codes and substitution direction.

## Composition

- Main configuration screens use a single centered ledger column, not nested card grids.
- Ruled dividers structure lists and sections.
- Team age badges and pitch position tags behave like removable tactics-board magnets.
- The Sideline mark shows a ball crossing a touchline, combining the match setting with a small flash of substitution orange.
- Golden Dragons use a gold-and-turf dragon shield; Fireballers use an ink shield with an orange flame and ball. Team crests identify squads without replacing text labels.
- The live game expands to a two-column pitch/bench workspace on larger screens and a single scan path on phones.
- New-game setup uses a linear sequence of three focused panels—Attendance, Formation, and Starters—with a compact current-step progress indicator and persistent destination-labeled controls (for example, Formation or Starters) instead of cramped tabs or one long scrolling form. Backward and forward controls share the same mobile toolbar structure. Attendance remains a two-column touch grid on phones to minimize vertical travel.
- The Starters step reuses the pitch as the primary assignment surface. Large position magnets open a bottom-sheet player picker, and the derived starting bench is shown as a compact name tray below the field.
- Critical live controls sit inside an opaque, edge-to-edge bottom surface with safe-area padding and individually rounded, inset touch targets. Content never shows through or around the navigation surface while scrolling.
- The game clock remains sticky below the app header on phones.

## Controls

- Minimum interactive target: 44px; critical controls are 50–66px.
- Buttons are square or minimally softened by default. On phones, setup and live toolbar commands use fixed, edge-to-edge bottom surfaces with borderless tap areas, compact filled capsule indicators, and safe-area padding; page content reserves the toolbar height exactly once. Bottom-sheet task and confirmation actions use full capsule buttons.
- Primary actions use turf. Substitution planning and confirmation use warm orange sparingly.
- A successful substitution opens a compact staging sheet with strong OUT / IN direction, jersey numbers, and the affected position; numbers stay out of routine screens to preserve scan speed.
- Planned substitutions use the same strong OUT / IN staging language before execution. A warm, high-visibility live-game banner makes the queued state persistent without obscuring the pitch, and exposes separate Review and Execute actions.
- A compact scoreboard sits directly below the game clock. The persistent Score control replaces Undo in the mobile dock and opens a focused scoring sheet; Undo moves into the expanded game log, where it remains available without competing with frequent match actions.
- The live match status uses two expanded tiers: team identity with End Game, then a normalized clock/score/period row. As this header scrolls away on phones, a separate compact row fades and slides into place with team, elapsed time, score, and End Game; reversing the scroll naturally restores the expanded header without layout snapping.
- Period boundaries surface as a full-width turf-tinted operational banner immediately below match status, pairing the break state with rotation review/planning and the next-period action. Regulation completion uses the same structure with danger emphasis for End Game.
- Short-sided attendance uses the danger color on both visible counts plus a bordered text alert, so the state never depends on color alone.
- On phones, the persistent End Game control uses a red icon capsule and label; the final confirmation remains a fully filled danger capsule.
- After end confirmation, a dedicated full-height game-summary page leads with the final score and uses a ruled roster ledger: each player has one bold total followed by plain position/time rows, with a direct zero-time message for players who never entered. The collapsed game-log disclosure follows the roster ledger, and a sticky footer provides the single return action without covering report content.
- PWA installation appears as a full-width turf-tinted action beneath team selection, visible only while running in a browser.
- Form controls use white fill, dark text, and a visible 1px neutral border.
- Focus uses a 3px blue outline with offset.
- Disabled controls retain their label and use reduced opacity.

## Pitch

The pitch is the signature surface. It uses real field markings and restrained mowing stripes. Player magnets show position, name, and accumulated playing time. Empty required positions use a dashed magnet and the word “Open,” making short-sided or injury states impossible to miss.

## Motion and accessibility

The product uses no decorative animation. State changes are immediate. `prefers-reduced-motion` reduces all transitions and animation durations. Semantic headings, labels, buttons, pressed states, dialogs, alerts, keyboard focus, and a skip link are included. Text and controls target WCAG AA contrast.

Modal bottom sheets lock the underlying document at its current scroll position while allowing the sheet itself to scroll, preventing background drift on both iOS and Android.

## Responsive rules

- At 760px, pitch and bench stack; the clock becomes sticky.
- At 520px, attendance becomes one column and setup assignments stack their select. Substitution rows retain the desktop OUT ↔ IN sequence using constrained selector columns, compact option text, and a visible directional icon.
- No critical action depends on hover.
