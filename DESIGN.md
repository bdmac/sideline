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
| Goal      | `#925700` | Completed-game goal markers                  |
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
- Full pitch views read bottom-to-top from the team’s defending goal toward the attacking end. Subtle Attack/Defend labels make that orientation explicit, and formation coordinates keep forwards outside the penalty-area edge while preserving recognizable defensive, midfield, and attacking lines.
- New-game setup uses a linear sequence of three focused panels—Attendance, Formation, and Starters—with one compact current-step progress indicator in the header and persistent destination-labeled controls (for example, Formation or Starters) instead of cramped tabs or one long scrolling form. The mobile toolbar contains navigation only and does not repeat progress. Backward and forward controls share the same structure. Attendance remains a two-column touch grid on phones to minimize vertical travel.
- The Starters step reuses the pitch as the primary assignment surface. Large position magnets open a bottom-sheet player picker, and the derived starting bench is shown as a compact name tray below the field.
- Critical live controls sit inside an opaque, edge-to-edge bottom surface with safe-area padding and individually rounded, inset touch targets. Content never shows through or around the navigation surface while scrolling.
- The game clock remains sticky below the app header on phones.
- The Game in progress strip on team selection shares the live game’s one-second clock cadence, including accurate paused and period-boundary states.

## Controls

- Minimum interactive target: 44px; critical controls are 50–66px.
- Buttons are square or minimally softened by default. On phones, setup and live toolbar commands use fixed, edge-to-edge bottom surfaces with borderless tap areas, compact filled capsule indicators, and safe-area padding; page content reserves the toolbar height exactly once. Every bottom sheet spans the full viewport width regardless of its desktop maximum, and task and confirmation actions use full capsule buttons.
- Primary actions use turf. Substitution planning and confirmation use warm orange sparingly.
- A successful substitution opens a compact staging sheet with strong OUT / IN direction, jersey numbers, and the affected position; numbers stay out of routine screens to preserve scan speed.
- Planned substitutions use shared OUT / IN column headings rather than repeating direction labels in every row. Native selectors remain name-first and compact; timing sits on a quieter supporting line beneath each control. OUT options surface the players most due for a break first, while IN options surface the least-played and longest-waiting players first. Already selected players are disabled in the same column’s other rows so normal interaction cannot create duplicate OUT or IN assignments. Editable rows retain the crossed-arrows substitution symbol grouped with the affected position between the columns. The compact confirmation keeps each row shallow by placing the position code immediately after the arrow and right-aligning incoming names against the IN edge; queued review returns to a vertical arrow/position grouping and a more spacious staging rhythm with jersey-numbered names. A warm, high-visibility live-game banner makes the queued state persistent without obscuring the pitch, and exposes separate Review and Execute actions.
- When the team-specific interval passes without an executed substitution—12.5% of configured duration for U8 and 25% for U12—the same warm operational banner language prompts the coach to consider substitutions and offers one direct Plan subs action. It remains non-modal, disappears while a plan is queued, resets only when an OUT/IN change actually reaches the field (including an automatic replacement), and yields to period-break banners.
- Bench rows pair the existing Take out of game control with a compact warm icon action: the same swap-arrows symbol used by Plan subs queues a new entry, while pencil edits an existing one. Accessible names and tooltips carry the full action wording. Players already included in the plan gain a turf-green row treatment and explicit destination status such as “Queued for GK,” matching the established IN language; the focused picker leads with preferred roles, then ranks on-field replacement choices by role fit before returning to the shared queued-plan review.
- When that focused picker is editing an existing queued player, it includes a clearly labeled outlined-danger “Remove from queue” action. This removes only that player’s pending swap and preserves the rest of the queued batch.
- The focused bench-player picker has a compact constrained viewport: its header and preference context remain fixed, roughly five replacement choices fit in an independently scrolling region, and the remove action stays pinned in a dedicated footer.
- Selecting a replacement from the focused bench-player picker closes directly back to the live game rather than forcing the queued-plan review sheet. The green queued row state and persistent queue banner provide immediate confirmation while preserving the coach’s bench-by-bench planning rhythm.
- In queued-plan review, the top-right X only dismisses the sheet. Removing queued work is instead labeled “Delete plan,” uses a filled danger treatment with a trash icon, and requires explicit confirmation so it cannot be mistaken for closing the view.
- A compact scoreboard sits directly below the game clock. Its separator occupies the same value row as both score numerals rather than floating between the labels and values. The persistent mobile dock contains Clock, Substitutions, Undo, and Score; its substitution action changes from “Plan subs” to “Review subs” when a queued plan exists. Position editing is removed from the dock because every pitch magnet is already its direct entry point.
- The own-team number in both expanded and compact score headers is a large, explicit touch target. It opens a quiet scorer ledger using the same amber ball markers as the final game summary.
- The live match status uses two expanded tiers: team identity with End Game, then a normalized clock/score/period row. As this header scrolls away on phones, a separate compact row fades and slides into place with team, elapsed time, score, and End Game; reversing the scroll naturally restores the expanded header without layout snapping.
- Period boundaries surface as a full-width turf-tinted operational banner immediately below match status, pairing the break state with substitution review/planning and the next-period action. When substitutions are already queued, this banner absorbs their count and becomes the sole “Review & execute” entry point; the regular queue banner returns only if play resumes without execution. Regulation completion uses the same structure with danger emphasis for End Game.
- Short-sided attendance uses the danger color on both visible counts plus a bordered text alert, so the state never depends on color alone.
- Only while attendance is short, its warning area exposes an “Add guest player” action. Guest rows span the compact grid, identify themselves in text, and offer a separate remove control; the entry sheet asks only for name and optional jersey number.
- A complete but undersized starter assignment changes the final setup action to “Start short-sided” and presents a calm confirmation explaining the player count before entering the live game.
- In a short-sided live game, an empty dashed pitch magnet is an actionable “Open” position. Tapping it opens the guest-player sheet and places the new guest directly into that role without a separate assignment step.
- The live Out of game list uses the same collapsed disclosure language as the game log. Its summary neutrally describes players as not currently available to play and keeps the count visible, while the infrequent Add to game controls stay out of the primary sideline scan path.
- Bench rows use progressive disclosure: identity and played history first, then a large live timer labeled “Sitting.” One secondary-status line beneath the history conditionally shows queued substitution, the warm “Below 50% pace” warning, or distinct total bench time in that priority order. Aggregate time never stacks beneath the live timer, and competing statuses never display together. Queue/edit and Take out of game remain visible as separate 44px actions because hiding a single secondary action would add friction without simplifying the row.
- The live roster rail uses a two-tab Bench / On field switcher with counts, a turf underline for the selected tab, semantic tab keyboard behavior, and horizontal swipe navigation. Bench occupies the left, primary position and remains the default. On-field rows mirror the bench geometry but lead with a “Playing” timer and position; queue stays direct, while a genuine two-item More sheet groups Change positions and Take out of game. Tapping the same player on the pitch opens the complete three-action sheet instead. Both sheets use the same neutral outlined action rows without an ancillary header rule. Every substitution action retains the shared crossed-arrows symbol used by the live dock and player lists, while Change positions uses a distinct four-direction Move icon and removal uses the player-removal icon; semantic color is confined to the queue and removal icons.
- The game-summary soccer-ball marker is reused immediately after scorer names across roomy in-game lists and sheets. Pitch magnets omit it to protect field legibility, and native select options remain plain text because they cannot render the shared SVG reliably.
- On phones, the persistent End Game control uses a red icon capsule and label; the final confirmation remains a fully filled danger capsule.
- After end confirmation, a dedicated full-height game-summary page resets to the top, leads with the final score, and uses a ruled roster ledger sorted with scorers first and then by playing time. Each player has one bold total followed by plain position/time rows, with a direct zero-time message for players who never entered. Scorers receive one small soccer-ball marker per goal beside their name; goal positions and exact times stay in the game log to keep the player ledger calm. The collapsed game-log disclosure follows the roster ledger, and a sticky footer provides the single return action without covering report content.
- PWA installation appears as a full-width turf-tinted action beneath team selection, visible only while running in a browser.
- Form controls use white fill, dark text, and a visible 1px neutral border.
- Focus uses a 3px blue outline with offset.
- Disabled controls retain their label and use reduced opacity.

## Pitch

The pitch is the signature surface. It uses real field markings and restrained mowing stripes. Occupied player magnets use a stable two-row layout: position at top left, the high-weight accumulated playing timer at top right, and the player name centered beneath. The redundant “played” label is omitted inside the compact magnet. Nearby helper copy explicitly calls out tap-for-actions and drag-to-swap. A tap opens a player-scoped action sheet containing Queue substitution, Change positions, and Take out of game; the subsequent position editor is position-only, with a static player/current-position summary and the same large, scrollable player-choice rows used by substitution sheets. Empty required positions use a dashed magnet and the word “Open,” making short-sided or injury states impossible to miss.

## Motion and accessibility

The product uses no decorative animation. State changes are immediate. `prefers-reduced-motion` reduces all transitions and animation durations. Semantic headings, labels, buttons, pressed states, dialogs, alerts, keyboard focus, and a skip link are included. Text and controls target WCAG AA contrast.

Modal bottom sheets lock the underlying document at its current scroll position while allowing the sheet itself to scroll, preventing background drift on both iOS and Android. Tapping or clicking the shaded backdrop dismisses every sheet; for destructive confirmations, backdrop dismissal is equivalent to Cancel and never performs the action.

## Responsive rules

- At 760px, pitch and bench stack; the clock becomes sticky.
- At 520px, attendance becomes one column and setup assignments stack their select. Substitution rows retain the desktop OUT ↔ IN sequence using constrained selector columns, compact option text, and a visible directional icon.
- No critical action depends on hover.
