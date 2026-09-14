# Sideline product truth

## Purpose

Sideline is a mobile-first, installable game-day clipboard for youth recreational soccer coaches. It reduces attention cost during a match: the coach should be able to understand who is playing, who is waiting, how long each player has participated, and what the next fair substitution should be with a glance and a few large taps.

## Users and setting

- A volunteer or recreational coach standing outdoors in bright light, often using one hand.
- The same coach may manage two independent squads: U8 playing 5v5 and U12 playing 9v9.
- Connectivity is not assumed. There is no account, backend, or cross-device sync.

## Durable behavior

- Team selection asks which team is playing and keeps team state explicitly separate. Its helper copy mentions starting a game normally and switches to resuming only while a game is in progress.
- When a game is active, team selection shows its current clock state and a live elapsed timer in the resume strip rather than a stale snapshot.
- Team names, rosters, and game durations are fixed product data.
- Game setup is a three-step linear flow for attendance, formation (including U8 period format), and starters/bench. Navigation buttons name their destination, and step selections remain intact when moving backward. Attendance below the team’s side size changes the count to a danger state and explicitly states the current count, required count, and shortfall.
- Starter assignment uses the selected formation as a tactics board. Tapping a position opens the present-player picker; choosing an assigned player swaps positions, while choosing a bench player replaces the current starter. Manual player choices and the Starting bench list are alphabetical for quick scanning. Auto-fill preserves manually assigned starters and optimizes the remaining present players only for open positions. It is disabled when the board is already full.
- Formations include an explicit goalkeeper plus the correct number of field positions.
- The game clock can pause and resume. Persisted timestamps allow safe recovery after refresh or relaunch.
- Returning to a running game after Sideline was hidden immediately materializes elapsed time, persists the recovered clock, honors period boundaries, and surfaces an overdue substitution reminder without waiting for the next ordinary timer tick.
- Player field and bench time accrue only while the game clock runs.
- Fair substitution suggestions prioritize players with the least total playing time coming in and players with the most playing time going out, so late arrivals are not penalized for having a short current bench stint. When several outgoing candidates are reasonably close in playing time, the planner spreads changes across defensive, midfield, and attacking lines and avoids replacing an entire line at once when possible. A substantial playing-time gap still takes precedence over line continuity.
- During live play, a non-modal reminder appears when too much scheduled game time passes without an executed substitution: 12.5% for U8 (5 minutes in a 40-minute game) and 25% for U12 (15 minutes in a 60-minute game). Executing an OUT/IN substitution resets the hidden game-time tracker; an automatic bench replacement for a departing player also resets it because the on-field personnel changed. Merely queueing a plan does not reset the timer, though the queued plan suppresses the reminder. Pauses do not advance it, and period-break actions take precedence.
- Device-local game-day settings optionally keep the screen awake while an active game is visible and play one two-note chime per newly due substitution reminder, with vibration where the browser supports it. Wake lock is a progressive enhancement: it releases when Sideline is hidden, reacquires on return, reports failure rather than pretending to be active, and remains disabled on unsupported browsers.
- Substitution reminders are team-level and do not require a goalkeeper change. Existing goalkeeper-reserve safeguards and coach overrides continue to control goalkeeper rotation without a second competing reminder timer.
- Goalkeeper-capable players use a protected rotation: when possible, one goalkeeper remains in reserve rather than being suggested at an outfield position. With three or more goalkeeper options, one may play outfield while another remains reserved. Coaches may override every suggestion.
- Substitution planning defaults to the full recommended rotation after applying the goalkeeper reserve, capped by the number of players on the field. Changing the requested swap count re-optimizes untouched suggestions; once the coach has selected or queued specific pairs, count changes preserve those choices and add or trim only the surrounding suggestions.
- The multi-player planner uses a compact OUT / IN ledger. Player selectors stay concise while a separate status line shows the outgoing player’s current field stint and total playing time and the incoming player’s current bench stint and total playing time. OUT choices rank longest current field stint first, then greatest total playing time; IN choices rank least total playing time first, then longest current bench stint. Both use player name as the final tie-breaker. Players selected in another row remain visible but cannot be selected again in the same OUT or IN column, preventing duplicate plans before validation is needed. Every editable row keeps the substitution arrow and affected position between the columns. Its condensed confirmation places the position code directly after the arrow without repeating direction labels on every row; queued-plan review uses the same shared column language in a roomier staging layout.
- A confirmed substitution is atomic: no duplicate assignment, no player both on field and bench, and no accidental change in the valid field count.
- After a planned substitution or an automatic replacement for an on-field player taken out of the game, a substitution-ready sheet shows the numbered OUT / IN pairs and affected positions so the coach can organize players before play resumes.
- The latest confirmed substitution or out-of-game event can be undone.
- The game log is collapsed by default to protect live-screen space. Expanding it shows the affected player on out-of-game and return events and the OUT / IN players on substitutions.
- Position changes do not count as substitutions. Tapping an occupied player magnet opens that player’s complete action sheet with Queue substitution, Change positions, and Take out of game. Choosing Change positions opens an editor fixed to that player with current-position context and large “Swap with” player/position choice rows matching the substitution pickers; the player cannot be changed inside the editor. Dragging a magnet onto another position moves or swaps the players directly.
- Position changes from either interaction are recorded in the game log and can be undone as the latest event.
- The live game tracks a simple score. A coach records an own-team goal by choosing from the current outfield players (the active goalkeeper is omitted), or records an opponent goal without additional details. Goals carry the live timestamp, appear in the game log, participate in undo, persist with the active game, and produce the final score on the game summary.
- Tapping the own-team score in either live header opens a compact scorer breakdown with one ball marker per recorded goal.
- During a game, the same ball markers directly follow scorer names across pitch magnets and roomy bench, out-of-game, scoring, position, and substitution interfaces. One or two goals use individual ball markers; an exact hat trick uses three hatted balls; higher totals collapse to one hatted ball plus the exact count. Native select options remain text-only where markers cannot render reliably.
- The mobile control dock prioritizes Clock, Substitutions, Undo, and Score. Position changes remain immediately accessible by tapping or dragging players on the pitch, so a separate Positions dock command is unnecessary.
- On phones, the expanded team, clock, and score header compacts into one sticky match-status row while scrolling, preserving the team, elapsed time, score, and End Game action.
- The clock automatically pauses exactly at quarter and halftime boundaries, persists the break across refreshes, and presents substitution planning (or queued-plan review) plus an explicit start-next-period action. Regulation time also pauses automatically and prompts the coach to end the game; the coach may continue the clock when needed.
- Taking any player out of the game requires confirmation. Confirming a bench player removes them from availability; confirming an on-field player then uses the fairest available bench replacement and shows the resulting change, or leaves the position explicitly open when no replacement exists.
- Players not marked as attending begin in the Out of game section rather than disappearing. A late arrival can be added to the game and joins the bench, or fills an open position automatically when the team is short-sided.
- During attendance, the coach can add named guest players borrowed for that match, with an optional jersey number. Guests participate in assignment, timing, substitutions, scoring, persistence, and the final report, but never enter the team’s permanent roster and disappear when the game is closed.
- If fewer than the regulation side size are available, assigning every available player enables an explicitly confirmed short-sided start rather than blocking the game.
- During a short-sided live game, tapping an open pitch position can create a game-only guest and place them directly into that position. Their playing time begins at that moment.
- The live Out of game list is collapsed by default, describes its members as not currently available to play, shows its count in the summary row, and expands when a coach needs to add a player to the game.
- After 25% of regulation time, bench players below a 50% playing-time pace receive one compact warning. Bench rows prioritize identity and relevant timing exceptions. Players who have all sat since kickoff share one exact cohort timer above the list instead of repeating the game clock in every row; divergent sitting times return to the affected rows in `m:ss` below one minute and rounded values such as `4 min` afterward. Players with no accumulated field time read “Not played yet.” A single secondary-status line beneath the player’s history shows, in order of precedence, a queued substitution, the below-pace warning, or distinct total bench time. Redundant duplicate bench totals remain hidden. Queue/edit and Take out of game remain direct actions.
- The live roster area has accessible Bench and On field tabs, defaults to Bench, and also supports horizontal swipe navigation. On-field rows show position context and initially suppress “Playing” timing while every player’s current stint merely duplicates the main game clock. Once any current stint diverges, every on-field row gains comparable numeric timing in `m:ss` below one minute and rounded values such as `4 min` afterward. Their queue action starts with the outgoing player and asks which bench player should enter. A More sheet contains the two secondary actions: Change positions and Take out of game, while tapping the corresponding pitch player opens all three actions.
- When a player added to the game fills an open position, a player-ready sheet identifies the numbered player and their assigned position before play continues.
- Ending a game pauses and materializes the clock, scrolls the report to the top, then shows a per-player summary sorted with scorers first and remaining players by total playing time. It includes every position played, time at each position, total playing time, and total goals. The game log records the position occupied for each goal alongside its exact scoring time. The same confirmed-event game log appears below the player summary in a collapsed disclosure.
- Substitution planning is a persistent two-phase workflow. Queueing a plan does not change the lineup or timers; the live screen keeps the plan visible and editable until the coach executes every swap atomically at the actual substitution time. The review screen can remove individual swaps without creating empty replacement rows: removing one reduces the intended plan size by one, and removing the final swap deletes the queued plan. Stale plans remain visible but cannot execute until repaired or cancelled.
- Each available bench player has a direct queue action. It shows that player’s total playing time, current bench stint, and preferred roles, then lets the coach choose one current on-field player to replace; the resulting single swap starts a queue or updates that player within the existing queued batch without rebuilding unrelated swaps. Completing this focused action returns directly to the live game so the coach can continue working down the bench; full queued-plan review opens only on explicit request.
- Taking a queued bench player out of the game automatically removes that player’s swap while preserving every unaffected pair in the plan. Undoing the change restores the prior queued plan.
- Ending an active game requires confirmation.
- The home screen offers installation whenever Sideline is running in a browser. Supported browsers open their native install prompt; iPhone and iPad users receive concise Add to Home Screen instructions.

## Initial team defaults

| Team           | Format | Default duration                    | Formations                   |
| -------------- | ------ | ----------------------------------- | ---------------------------- |
| Golden Dragons | 5v5    | 40 minutes · 4 × 10-minute quarters | 1-2-1, 2-2, 1-1-2            |
| Fireballers    | 9v9    | 60 minutes · 2 × 30-minute halves   | 3-3-2, 3-2-3, 2-3-3, 3-1-3-1 |

Game formats are fixed presets. Golden Dragons games default to four 10-minute quarters and can be switched during setup to two 20-minute halves or two 25-minute halves. Fireballers always play two 30-minute halves, so that format is not shown as a configuration step.
Fireballers default to the 3-1-3-1 formation; coaches can still select another listed U12 formation during game setup.

The fixed U8 roster is Simon, Noah, Maddox, Ollie, Malik, Dylan, Henry, Haru, and Evan.

The fixed U12 roster is Jackson, Lazar, Nikola, Kai, Elliott, William, Obasi, Andrew, Matt, John, Eli, Aaron, Rayek, Jack, and Ryan.

Player records include jersey numbers for substitution staging. Confirmed Golden Dragons numbers are Simon 10, Ollie 23, Henry 12, and Haru 49. Confirmed Fireballers numbers are Jackson 82, William 78, Andrew 11, Matt 18, John 90, and Jack 5. Remaining numbers are provisional fixed metadata until the coach supplies the official assignments. Regular roster, setup, pitch, and timing views continue to prioritize player names rather than repeating numbers throughout the interface.

Player records also include ordered, provisional preferences across goalkeeper, defense, midfield, and forward:

- Golden Dragons: Simon (defense, midfield); Noah (defense, midfield); Maddox (goalkeeper, midfield, forward); Ollie (midfield, forward); Malik (forward, midfield); Dylan (defense, midfield); Henry (goalkeeper, midfield, forward); Haru (midfield, forward); Evan (goalkeeper, midfield). Maddox, Henry, and Evan are the only U8 goalkeeper options.
- Fireballers: Jackson (goalkeeper, defense, midfield); Lazar (defense, midfield); Nikola (defense, midfield); Kai (midfield, forward); Elliott (midfield, defense); William (forward, midfield); Obasi (defense, midfield); Andrew (midfield, forward); Matt (forward, midfield, goalkeeper); John (defense, midfield); Eli (midfield, forward); Aaron (forward, midfield); Rayek (goalkeeper, defense, midfield, forward); Jack (forward, midfield); Ryan (defense, midfield). Jackson, Matt, and Rayek are the U12 goalkeeper options.

Auto-fill maximizes these preferences deterministically. Substitution planning chooses who is due to enter by least total playing time, who is due to leave by most total playing time, applies the goalkeeper reserve, uses a bounded line-continuity adjustment to spread near-equal outgoing choices, then uses preferences to choose among equally fair positions.

## Data and privacy

All data is stored in browser `localStorage`. Roster and game state use a versioned key; light/dark appearance and game-day device preferences use separate keys. Sideline does not transmit names or game data. Clearing browser site data removes the data and preferences.

## MVP boundaries

The MVP does not include authentication, a backend, cloud sync, messaging, league scheduling, score tracking, opponent management, or long-term game reports. The active game log exists to support confident live operation and undo.

## Future ideas

- Replace roster-order priority in starter Auto-fill with a persistent fairness tie-breaker. A compact per-player rotation ledger could track games attended, games started, the most recent start, and optionally cumulative field time without requiring browsable full-game history. Positional fit would remain primary; among equally suitable players, Auto-fill would favor fewer starts and the least-recent starter before using roster order as the final deterministic fallback.
