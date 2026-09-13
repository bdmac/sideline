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
- Game setup covers attendance, formation, U8 period format, starters, and bench.
- Formations include an explicit goalkeeper plus the correct number of field positions.
- The game clock can pause and resume. Persisted timestamps allow safe recovery after refresh or relaunch.
- Player field and bench time accrue only while the game clock runs.
- Fair substitution suggestions prioritize players with the most bench time coming in and players with the most field time going out.
- Coaches control the number of swaps and may override every suggestion.
- A confirmed substitution is atomic: no duplicate assignment, no player both on field and bench, and no accidental change in the valid field count.
- After a planned substitution or an automatic replacement for an unavailable on-field player, a substitution-ready sheet shows the numbered OUT / IN pairs and affected positions so the coach can organize players before play resumes.
- The latest confirmed substitution or unavailable-player event can be undone.
- The game log is collapsed by default to protect live-screen space. Expanding it shows the affected player on availability events and the OUT / IN players on substitutions.
- Position changes do not count as substitutions. Tapping an occupied player magnet on the pitch opens the position editor with that player already selected; dragging a magnet onto another position moves or swaps the players directly.
- Position changes from either interaction are recorded in the game log and can be undone as the latest event.
- Marking an on-field player unavailable uses the fairest available bench replacement; if none exists, the open position is explicit.
- Players not marked as attending begin the game as unavailable rather than disappearing. A late arrival can be marked available and joins the bench, or fills an open position automatically when the team is short-sided.
- When a newly available player fills an open position, a player-ready sheet identifies the numbered player and their assigned position before play continues.
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

## Data and privacy

All data is stored in browser `localStorage` under a versioned key. Sideline does not transmit names or game data. Clearing browser site data removes the data.

## MVP boundaries

The MVP does not include authentication, a backend, cloud sync, messaging, league scheduling, score tracking, opponent management, or long-term game reports. The active game log exists to support confident live operation and undo.
