# Sideline product truth

## Purpose

Sideline is a mobile-first, installable game-day clipboard for youth recreational soccer coaches. It reduces attention cost during a match: the coach should be able to understand who is playing, who is waiting, how long each player has participated, and what the next fair substitution should be with a glance and a few large taps.

## Users and setting

- A volunteer or recreational coach standing outdoors in bright light, often using one hand.
- The same coach may manage two independent squads: U8 playing 5v5 and U12 playing 9v9.
- Connectivity is not assumed. There is no account, backend, or cross-device sync.

## Durable behavior

- Team choice is explicit and team state never mixes.
- Team names, rosters, and game durations are fixed product data.
- Game setup is a three-step linear flow for attendance, formation (including U8 period format), and starters/bench. Navigation buttons name their destination, and step selections remain intact when moving backward. Attendance below the team’s side size changes the count to a danger state and explicitly states the current count, required count, and shortfall.
- Starter assignment uses the selected formation as a tactics board. Tapping a position opens the present-player picker; choosing an assigned player swaps positions, while choosing a bench player replaces the current starter. Auto-fill restores the default roster-order assignment after positions are opened or reset and is disabled when the board is already full.
- Formations include an explicit goalkeeper plus the correct number of field positions.
- The game clock can pause and resume. Persisted timestamps allow safe recovery after refresh or relaunch.
- Player field and bench time accrue only while the game clock runs.
- Fair substitution suggestions prioritize players with the least total playing time coming in and players with the most playing time going out, so late arrivals are not penalized for having a short current bench stint.
- Goalkeeper-capable players use a protected rotation: when possible, one goalkeeper remains in reserve rather than being suggested at an outfield position. With three or more goalkeeper options, one may play outfield while another remains reserved. Coaches may override every suggestion.
- Substitution planning defaults to the full recommended rotation after applying the goalkeeper reserve, capped by the number of players on the field. Changing the requested swap count re-optimizes untouched suggestions; once the coach has selected or queued specific pairs, count changes preserve those choices and add or trim only the surrounding suggestions.
- A confirmed substitution is atomic: no duplicate assignment, no player both on field and bench, and no accidental change in the valid field count.
- After a planned substitution or an automatic replacement for an unavailable on-field player, a substitution-ready sheet shows the numbered OUT / IN pairs and affected positions so the coach can organize players before play resumes.
- The latest confirmed substitution or unavailable-player event can be undone.
- The game log is collapsed by default to protect live-screen space. Expanding it shows the affected player on availability events and the OUT / IN players on substitutions.
- Position changes do not count as substitutions. Tapping an occupied player magnet opens an editor fixed to that player, shows their current position, and offers a single “Swap with” selector; the player cannot be changed inside the sheet. Dragging a magnet onto another position moves or swaps the players directly.
- Position changes from either interaction are recorded in the game log and can be undone as the latest event.
- The live game tracks a simple score. A coach records an own-team goal by choosing from the current outfield players (the active goalkeeper is omitted), or records an opponent goal without additional details. Goals carry the live timestamp, appear in the game log, participate in undo, persist with the active game, and produce the final score on the game summary.
- Tapping the own-team score in either live header opens a compact scorer breakdown with one ball marker per recorded goal.
- During a game, the same ball markers directly follow scorer names in roomy bench, unavailable, scoring, position, and substitution interfaces. Pitch magnets and native select options remain text-only where markers would crowd or cannot render reliably.
- The mobile control dock prioritizes Clock, Substitutions, Undo, and Score. Position changes remain immediately accessible by tapping or dragging players on the pitch, so a separate Positions dock command is unnecessary.
- On phones, the expanded team, clock, and score header compacts into one sticky match-status row while scrolling, preserving the team, elapsed time, score, and End Game action.
- The clock automatically pauses exactly at quarter and halftime boundaries, persists the break across refreshes, and presents substitution planning (or queued-plan review) plus an explicit start-next-period action. Regulation time also pauses automatically and prompts the coach to end the game; the coach may continue the clock when needed.
- Marking an on-field player unavailable uses the fairest available bench replacement; if none exists, the open position is explicit.
- Players not marked as attending begin the game as unavailable rather than disappearing. A late arrival can be marked available and joins the bench, or fills an open position automatically when the team is short-sided.
- During attendance, the coach can add named guest players borrowed for that match, with an optional jersey number. Guests participate in assignment, timing, substitutions, scoring, persistence, and the final report, but never enter the team’s permanent roster and disappear when the game is closed.
- If fewer than the regulation side size are available, assigning every available player enables an explicitly confirmed short-sided start rather than blocking the game.
- During a short-sided live game, tapping an open pitch position can create a game-only guest and place them directly into that position. Their playing time begins at that moment.
- The live unavailable-player list is collapsed by default, shows its count in the summary row, and expands when a coach needs to return a player to the game.
- After 25% of regulation time, bench players below a 50% playing-time pace receive one compact warning. Bench rows prioritize identity and the live “Sitting” timer. A single secondary-status line beneath the player’s history shows, in order of precedence, a queued substitution, the below-pace warning, or distinct total bench time. Redundant zero-played and duplicate bench totals remain hidden. Queue/edit and Mark unavailable remain direct actions.
- When a newly available player fills an open position, a player-ready sheet identifies the numbered player and their assigned position before play continues.
- Ending a game pauses and materializes the clock, scrolls the report to the top, then shows a per-player summary sorted with scorers first and remaining players by total playing time. It includes every position played, time at each position, total playing time, and total goals. The game log records the position occupied for each goal alongside its exact scoring time. The same confirmed-event game log appears below the player summary in a collapsed disclosure.
- Substitution planning is a persistent two-phase workflow. Queueing a plan does not change the lineup or timers; the live screen keeps the plan visible and editable until the coach executes every swap atomically at the actual substitution time. Stale plans remain visible but cannot execute until repaired or cancelled.
- Each available bench player has a direct queue action. It shows that player’s total playing time, current bench stint, and preferred roles, then lets the coach choose one current on-field player to replace; the resulting single swap starts a queue or updates that player within the existing queued batch without rebuilding unrelated swaps. Completing this focused action returns directly to the live game so the coach can continue working down the bench; full queued-plan review opens only on explicit request.
- Marking a queued bench player unavailable automatically removes that player’s swap while preserving every unaffected pair in the plan. Undoing the availability change restores the prior queued plan.
- Ending an active game requires confirmation.
- The home screen offers installation whenever Sideline is running in a browser. Supported browsers open their native install prompt; iPhone and iPad users receive concise Add to Home Screen instructions.

## Initial team defaults

| Team           | Format | Default duration                    | Formations                   |
| -------------- | ------ | ----------------------------------- | ---------------------------- |
| Golden Dragons | 5v5    | 40 minutes · 4 × 10-minute quarters | 1-2-1, 2-2, 1-1-2            |
| Fireballers    | 9v9    | 60 minutes · 2 × 30-minute halves   | 3-3-2, 3-2-3, 2-3-3, 3-1-3-1 |

Game durations are fixed. Golden Dragons games can be switched from the default four quarters to two halves while starting a game. Fireballers always play two halves, so that format is not shown as a configuration step.
Fireballers default to the 3-1-3-1 formation; coaches can still select another listed U12 formation during game setup.

The fixed U8 roster is Simon, Noah, Maddox, Ollie, Malik, Dylan, Henry, Haru, and Evan.

The fixed U12 roster is Jackson, Lazar, Nikola, Kai, Elliott, William, Obasi, Andrew, Matt, John, Eli, Aaron, Rayek, Jack, and Ryan.

Player records include jersey numbers for substitution staging. Confirmed Golden Dragons numbers are Simon 10, Ollie 23, Henry 12, and Haru 49. Confirmed Fireballers numbers are Jackson 82, William 78, Andrew 11, Matt 18, John 90, and Jack 5. Remaining numbers are provisional fixed metadata until the coach supplies the official assignments. Regular roster, setup, pitch, and timing views continue to prioritize player names rather than repeating numbers throughout the interface.

Player records also include ordered, provisional preferences across goalkeeper, defense, midfield, and forward:

- Golden Dragons: Simon (goalkeeper, defense, midfield); Noah (defense, midfield); Maddox (midfield, forward); Ollie (midfield, forward); Malik (forward, midfield); Dylan (defense, goalkeeper); Henry (defense, midfield); Haru (midfield, forward); Evan (goalkeeper, defense, midfield).
- Fireballers: Jackson (goalkeeper, defense); Lazar (defense, midfield); Nikola (defense, midfield); Kai (midfield, forward); Elliott (midfield, defense); William (forward, midfield); Obasi (defense, midfield); Andrew (midfield, forward); Matt (defense, midfield); John (goalkeeper, defense); Eli (midfield, forward); Aaron (forward, midfield); Rayek (defense, midfield); Jack (forward, midfield); Ryan (goalkeeper, defense, midfield).

Auto-fill maximizes these preferences deterministically. Substitution planning chooses who is due to enter by least total playing time, who is due to leave by most total playing time, applies the goalkeeper reserve, then uses preferences to choose among equally fair positions.

## Data and privacy

All data is stored in browser `localStorage` under a versioned key. Sideline does not transmit names or game data. Clearing browser site data removes the data.

## MVP boundaries

The MVP does not include authentication, a backend, cloud sync, messaging, league scheduling, score tracking, opponent management, or long-term game reports. The active game log exists to support confident live operation and undo.
