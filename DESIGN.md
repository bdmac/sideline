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
- Critical live controls sit inside an opaque, edge-to-edge bottom surface with safe-area padding and individually rounded, inset touch targets. Content never shows through or around the navigation surface while scrolling.
- The game clock remains sticky below the app header on phones.

## Controls

- Minimum interactive target: 44px; critical controls are 50–66px.
- Buttons are square or minimally softened by default. On phones, setup and live toolbar commands have borderless tap areas with compact filled capsule indicators for primary actions; bottom-sheet task and confirmation actions use full capsule buttons.
- Primary actions use turf. Substitution planning and confirmation use warm orange sparingly.
- A successful substitution opens a compact staging sheet with strong OUT / IN direction, jersey numbers, and the affected position; numbers stay out of routine screens to preserve scan speed.
- On phones, the persistent End Game control uses a red icon capsule and label; the final confirmation remains a fully filled danger capsule.
- PWA installation appears as a full-width turf-tinted action beneath team selection, visible only while running in a browser.
- Form controls use white fill, dark text, and a visible 1px neutral border.
- Focus uses a 3px blue outline with offset.
- Disabled controls retain their label and use reduced opacity.

## Pitch

The pitch is the signature surface. It uses real field markings and restrained mowing stripes. Player magnets show position, name, and accumulated playing time. Empty required positions use a dashed magnet and the word “Open,” making short-sided or injury states impossible to miss.

## Motion and accessibility

The product uses no decorative animation. State changes are immediate. `prefers-reduced-motion` reduces all transitions and animation durations. Semantic headings, labels, buttons, pressed states, dialogs, alerts, keyboard focus, and a skip link are included. Text and controls target WCAG AA contrast.

## Responsive rules

- At 760px, pitch and bench stack; the clock becomes sticky.
- At 520px, attendance becomes one column and setup assignments stack their select. Substitution rows retain the desktop OUT ↔ IN sequence using constrained selector columns, compact option text, and a visible directional icon.
- No critical action depends on hover.
