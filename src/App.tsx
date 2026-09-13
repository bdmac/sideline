import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  UserRoundX,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applySubstitutions,
  assignPlayerToPosition,
  createGame,
  formatDuration,
  getDisplayedSeconds,
  getFormation,
  getFormationsForTeam,
  getPeriodStatus,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  setClockRunning,
  suggestSubstitutions,
  undoLastEvent,
  validateGame,
} from "./domain";
import { loadState, saveState } from "./storage";
import type {
  ActiveGame,
  AppState,
  Player,
  SubstitutionPair,
  Team,
  TeamId,
} from "./types";

type Screen =
  { name: "home" } | { name: "setup"; teamId: TeamId } | { name: "live" };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const playerName = (team: Team, id: string) =>
  team.roster.find((player) => player.id === id)?.name ?? "Unknown player";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const stateRef = useRef(state);
  const [screen, setScreen] = useState<Screen>(() =>
    state.activeGame ? { name: "live" } : { name: "home" },
  );
  const screenKey =
    screen.name === "setup" ? `${screen.name}:${screen.teamId}` : screen.name;
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  const commitState = (update: (current: AppState) => AppState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    saveState(next);
    setState(next);
  };

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const persist = () => saveState(stateRef.current);
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [screenKey]);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
  };

  const activeTeam = state.activeGame
    ? state.teams[state.activeGame.teamId]
    : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={() => setScreen({ name: "home" })}
          aria-label="Go to team selection"
        >
          <SidelineMark />
          <span>Sideline</span>
        </button>
        <span className="local-status">
          <ShieldCheck size={16} aria-hidden="true" />
          Saved on this device
        </span>
      </header>

      <main id="main">
        {screen.name === "home" && (
          <HomeScreen
            state={state}
            onChooseTeam={(teamId) => {
              if (state.activeGame?.teamId === teamId) {
                setScreen({ name: "live" });
              } else {
                setScreen({ name: "setup", teamId });
              }
            }}
            onResume={() => setScreen({ name: "live" })}
            showInstall={!installed}
            onInstall={installApp}
          />
        )}
        {screen.name === "setup" && (
          <SetupScreen
            team={state.teams[screen.teamId]}
            onBack={() => setScreen({ name: "home" })}
            onStart={(game) => {
              commitState((current) => ({ ...current, activeGame: game }));
              setScreen({ name: "live" });
            }}
          />
        )}
        {screen.name === "live" && state.activeGame && activeTeam && (
          <LiveGameScreen
            game={state.activeGame}
            team={activeTeam}
            onChange={(game) =>
              commitState((current) => ({ ...current, activeGame: game }))
            }
            onEnd={() => {
              commitState((current) => ({ ...current, activeGame: null }));
              setScreen({ name: "home" });
            }}
          />
        )}
        {screen.name === "live" && !state.activeGame && (
          <EmptyState
            title="No active game"
            body="Choose a team to prepare a new match."
            action="Choose a team"
            onAction={() => setScreen({ name: "home" })}
          />
        )}
      </main>
      {installHelpOpen && (
        <InstallHelpDialog
          ios={isIos()}
          onClose={() => setInstallHelpOpen(false)}
        />
      )}
    </div>
  );
}

function HomeScreen({
  state,
  onChooseTeam,
  onResume,
  showInstall,
  onInstall,
}: {
  state: AppState;
  onChooseTeam: (teamId: TeamId) => void;
  onResume: () => void;
  showInstall: boolean;
  onInstall: () => void;
}) {
  const activeTeam = state.activeGame
    ? state.teams[state.activeGame.teamId]
    : null;
  return (
    <div className="page home-page">
      <section className="page-heading">
        <div>
          <h1>Which team are you coaching?</h1>
          <p>Choose the squad you are with today. Game state stays separate.</p>
        </div>
      </section>

      {state.activeGame && activeTeam && (
        <button className="resume-strip" type="button" onClick={onResume}>
          <span className="resume-pulse" aria-hidden="true" />
          <span>
            <strong>Game in progress · {activeTeam.name}</strong>
            <small>
              {state.activeGame.clock.running
                ? "Clock running"
                : "Clock paused"}{" "}
              · {formatDuration(getDisplayedSeconds(state.activeGame))}
            </small>
          </span>
          <span className="resume-action">
            Resume <ChevronRight size={20} aria-hidden="true" />
          </span>
        </button>
      )}

      <div className="team-ledger">
        {(Object.values(state.teams) as Team[]).map((team) => {
          const hasOtherActiveGame =
            state.activeGame && state.activeGame.teamId !== team.id;
          return (
            <button
              type="button"
              className="team-row"
              key={team.id}
              disabled={Boolean(hasOtherActiveGame)}
              onClick={() => onChooseTeam(team.id)}
            >
              <TeamCrest teamId={team.id} />
              <span className="team-row-main">
                <strong>{team.name}</strong>
                <small>
                  {team.sideSize}v{team.sideSize} ·{" "}
                  {team.roster.filter((player) => player.active).length} players
                </small>
              </span>
              {hasOtherActiveGame && (
                <span className="locked-note">Other team active</span>
              )}
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {showInstall && (
        <button className="install-strip" type="button" onClick={onInstall}>
          <Download size={22} aria-hidden="true" />
          <span>
            <strong>Install Sideline</strong>
            <small>
              Keep it on your home screen for quick game-day access.
            </small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}

      <p className="privacy-note">
        Sideline works offline. Names and game data stay in this browser.
      </p>
    </div>
  );
}

function InstallHelpDialog({
  ios,
  onClose,
}: {
  ios: boolean;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        className="bottom-sheet confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
      >
        <h2 id="install-title">Install Sideline</h2>
        <p>
          {ios
            ? "In Safari, tap the Share button, choose Add to Home Screen, then tap Add."
            : "Open your browser menu and choose Install app or Add to Home screen."}
        </p>
        <button className="primary-action" type="button" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}

function SetupScreen({
  team,
  onBack,
  onStart,
}: {
  team: Team;
  onBack: () => void;
  onStart: (game: ActiveGame) => void;
}) {
  const activePlayers = useMemo(
    () => team.roster.filter((player) => player.active),
    [team.roster],
  );
  const formations = getFormationsForTeam(team);
  const [presentIds, setPresentIds] = useState(
    activePlayers.map((player) => player.id),
  );
  const [formationId, setFormationId] = useState(
    formations.some((formation) => formation.id === team.defaultFormationId)
      ? team.defaultFormationId
      : formations[0].id,
  );
  const [periodCount, setPeriodCount] = useState<2 | 4>(
    team.defaultPeriodCount,
  );
  const formation = getFormation(formationId);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      formation.positions.map((position, index) => [
        position.id,
        activePlayers[index]?.id ?? "",
      ]),
    ),
  );

  const changeFormation = (nextFormationId: string) => {
    const nextFormation = getFormation(nextFormationId);
    const present = activePlayers.filter((player) =>
      presentIds.includes(player.id),
    );
    setFormationId(nextFormationId);
    setAssignments(
      Object.fromEntries(
        nextFormation.positions.map((position, index) => [
          position.id,
          present[index]?.id ?? "",
        ]),
      ),
    );
  };

  const selectedIds = Object.values(assignments).filter(Boolean);
  const expectedOnField = team.sideSize;
  const assignmentCount = selectedIds.length;
  const benchIds = presentIds.filter((id) => !selectedIds.includes(id));
  const canStart =
    presentIds.length >= team.sideSize && assignmentCount === expectedOnField;

  const toggleAttendance = (playerId: string) => {
    setPresentIds((current) => {
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      const stillPresent = new Set(next);
      setAssignments((currentAssignments) => {
        const clean = Object.fromEntries(
          Object.entries(currentAssignments).map(([positionId, id]) => [
            positionId,
            stillPresent.has(id) ? id : "",
          ]),
        );
        const used = new Set(Object.values(clean).filter(Boolean));
        const available = activePlayers
          .filter(
            (player) => stillPresent.has(player.id) && !used.has(player.id),
          )
          .map((player) => player.id);
        for (const position of formation.positions) {
          if (!clean[position.id] && available.length) {
            clean[position.id] = available.shift()!;
          }
        }
        return clean;
      });
      return next;
    });
  };

  const start = () => {
    if (!canStart) return;
    const game = createGame(
      team,
      formationId,
      presentIds,
      team.defaultDurationMinutes,
      Date.now(),
      periodCount,
    );
    game.assignments = Object.fromEntries(
      Object.entries(assignments).filter(([, id]) => Boolean(id)),
    );
    game.benchIds = benchIds;
    onStart(game);
  };

  return (
    <div className="page setup-page">
      <PageBack onClick={onBack}>Team selection</PageBack>
      <section className="page-heading">
        <div>
          <h1>Prepare game</h1>
          <p>Attendance first, then formation and starting positions.</p>
        </div>
      </section>

      <section className="setup-section">
        <div className="section-title">
          <h2>1. Who is here?</h2>
          <span>{presentIds.length} present</span>
        </div>
        <div className="attendance-grid">
          {activePlayers.map((player) => {
            const present = presentIds.includes(player.id);
            return (
              <button
                className={`attendance-button ${present ? "selected" : ""}`}
                type="button"
                key={player.id}
                aria-pressed={present}
                onClick={() => toggleAttendance(player.id)}
              >
                <span className="attendance-check" aria-hidden="true">
                  {present ? <Check size={17} /> : <X size={17} />}
                </span>
                <span>
                  <strong>{player.name}</strong>
                  <small>{present ? "Present" : "Absent"}</small>
                </span>
              </button>
            );
          })}
        </div>
        {presentIds.length < team.sideSize && (
          <p className="inline-warning">
            <CircleAlert size={18} aria-hidden="true" />
            {team.sideSize - presentIds.length} more{" "}
            {team.sideSize - presentIds.length === 1
              ? "player is"
              : "players are"}{" "}
            needed to start this {team.sideSize}v{team.sideSize} game.
          </p>
        )}
      </section>

      <section className="setup-section">
        <div className="section-title">
          <h2>2. Choose the formation</h2>
          <span>Goalkeeper is explicit</span>
        </div>
        <div
          className={`formation-picker side-${team.sideSize}`}
          aria-label="Formation"
        >
          {formations.map((item) => (
            <button
              type="button"
              key={item.id}
              className={formationId === item.id ? "active" : ""}
              aria-pressed={formationId === item.id}
              aria-label={`${item.name} formation`}
              onClick={() => changeFormation(item.id)}
            >
              <FormationDiagram formation={item} />
              <strong>{item.name}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="setup-section">
        <div className="section-title">
          <h2>3. Assign starters</h2>
          <span>
            {assignmentCount}/{expectedOnField} assigned
          </span>
        </div>
        <div className="assignment-list">
          {formation.positions.map((position) => (
            <label className="assignment-row" key={position.id}>
              <span className="position-code">{position.shortLabel}</span>
              <span>{position.label}</span>
              <select
                value={assignments[position.id] ?? ""}
                onChange={(event) =>
                  setAssignments((current) =>
                    assignPlayerToPosition(
                      current,
                      position.id,
                      event.target.value,
                    ),
                  )
                }
              >
                {!assignments[position.id] && (
                  <option value="" disabled>
                    Select player
                  </option>
                )}
                {activePlayers
                  .filter((player) => presentIds.includes(player.id))
                  .map((player) => (
                    <option value={player.id} key={player.id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <div className="bench-preview">
          <strong>Starting bench</strong>
          <span>
            {benchIds.length
              ? benchIds.map((id) => playerName(team, id)).join(", ")
              : "No bench — exactly enough players"}
          </span>
        </div>
      </section>

      {team.id === "u8" && (
        <section className="setup-section compact">
          <label className="field">
            <span>Game format</span>
            <select
              value={periodCount}
              onChange={(event) =>
                setPeriodCount(Number(event.target.value) as 2 | 4)
              }
            >
              <option value={4}>
                4 quarters ·{" "}
                {formatDuration((team.defaultDurationMinutes * 60) / 4)} each
              </option>
              <option value={2}>
                2 halves ·{" "}
                {formatDuration((team.defaultDurationMinutes * 60) / 2)} each
              </option>
            </select>
          </label>
        </section>
      )}

      <div className="setup-submit">
        <button
          className="primary-action"
          type="button"
          disabled={!canStart}
          onClick={start}
        >
          <Play size={22} aria-hidden="true" /> Start game
        </button>
        {!canStart && presentIds.length > 0 && (
          <span>All {team.sideSize} positions must be filled.</span>
        )}
      </div>
    </div>
  );
}

function LiveGameScreen({
  game,
  team,
  onChange,
  onEnd,
}: {
  game: ActiveGame;
  team: Team;
  onChange: (game: ActiveGame) => void;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [error, setError] = useState("");
  const formation = getFormation(game.formationId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const displayed = materializeGame(game, now);
  const fieldIds = Object.values(game.assignments);
  const remaining = Math.max(
    0,
    game.durationSeconds - displayed.clock.elapsedSeconds,
  );
  const period = getPeriodStatus(
    game.durationSeconds,
    displayed.clock.elapsedSeconds,
    game.periodCount,
  );
  const validationErrors = validateGame(game, team.sideSize);

  const safeChange = (change: () => ActiveGame) => {
    try {
      setError("");
      onChange(change());
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Could not update game",
      );
    }
  };

  return (
    <div className="live-page">
      <header className="match-header">
        <div>
          <TeamCrest teamId={team.id} compact />
          <span>
            <strong>{team.name}</strong>
            <small>
              {formation.name} · {team.sideSize}v{team.sideSize}
            </small>
          </span>
        </div>
        <button
          className="danger-action end-game-button"
          type="button"
          onClick={() => setEndConfirm(true)}
        >
          <Square size={18} aria-hidden="true" />
          End game
        </button>
      </header>

      <section className="game-clock" aria-label="Game clock">
        <div>
          <span
            className={`clock-state ${game.clock.running ? "running" : ""}`}
          >
            {game.clock.running ? "Clock running" : "Clock paused"}
          </span>
          <strong>{formatDuration(displayed.clock.elapsedSeconds)}</strong>
        </div>
        <div className="clock-secondary">
          <span>
            {period.label} {period.current} of {period.count} ·{" "}
            {formatDuration(period.remainingSeconds)} left
          </span>
          <span>
            {remaining > 0
              ? `${formatDuration(remaining)} remaining`
              : "Duration reached"}
          </span>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={20} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="short-side-banner">
          <CircleAlert size={19} aria-hidden="true" />
          {validationErrors.join(". ")}
        </div>
      )}

      <div className="live-layout">
        <section className="pitch-section">
          <div className="section-title">
            <h1>On the field</h1>
            <span>
              {fieldIds.length}/
              {Math.min(
                team.sideSize,
                game.presentIds.length - game.unavailableIds.length,
              )}
            </span>
          </div>
          <Pitch
            formation={formation}
            assignments={game.assignments}
            team={team}
            totals={displayed.totals}
          />
        </section>

        <aside className="bench-section">
          <div className="section-title">
            <h2>Bench</h2>
            <span>{game.benchIds.length}</span>
          </div>
          {game.benchIds.length ? (
            <div className="bench-list">
              {game.benchIds.map((id) => (
                <PlayerTimeRow
                  key={id}
                  player={team.roster.find((player) => player.id === id)!}
                  primaryTime={displayed.totals[id]?.benchSeconds ?? 0}
                  primaryLabel="bench"
                  secondaryTime={displayed.totals[id]?.fieldSeconds ?? 0}
                  secondaryLabel="played"
                  onUnavailable={() =>
                    safeChange(() =>
                      markUnavailable(game, id, team.sideSize, Date.now()),
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <div className="bench-empty">
              <strong>No available substitutes</strong>
              <span>Position changes are still available.</span>
            </div>
          )}

          <div className="availability-section">
            <h3>Unavailable</h3>
            {game.unavailableIds.length ? (
              <div className="unavailable-list">
                {game.unavailableIds.map((id) => (
                  <div className="unavailable-row" key={id}>
                    <span>
                      <strong>{playerName(team, id)}</strong>
                      <small>Not available</small>
                    </span>
                    <button
                      className="secondary-action"
                      type="button"
                      aria-label={`Mark ${playerName(team, id)} available`}
                      onClick={() =>
                        safeChange(() =>
                          markAvailable(game, id, team.sideSize, Date.now()),
                        )
                      }
                    >
                      Mark available
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>Everyone present is available.</p>
            )}
          </div>
        </aside>
      </div>

      <section className="game-log">
        <div className="section-title">
          <h2>Game log</h2>
          <span>{game.history.length} events</span>
        </div>
        {game.history.length ? (
          <ol>
            {[...game.history].reverse().map((event) => (
              <li key={event.id}>
                <time>{formatDuration(event.atSeconds)}</time>
                <span>
                  <strong>
                    {event.type === "substitution"
                      ? `${event.pairs.length} substitution${event.pairs.length === 1 ? "" : "s"}`
                      : event.type === "available"
                        ? "Player available"
                        : "Player unavailable"}
                  </strong>
                  <small>
                    {event.pairs.length
                      ? event.pairs
                          .map(
                            (pair) =>
                              `${playerName(team, pair.outPlayerId)} → ${playerName(team, pair.inPlayerId)}`,
                          )
                          .join(" · ")
                      : event.note}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">Confirmed changes will appear here.</p>
        )}
      </section>

      <div className="mobile-control-dock" aria-label="Game controls">
        <button
          className="clock-button"
          type="button"
          onClick={() =>
            safeChange(() => setClockRunning(game, !game.clock.running))
          }
        >
          {game.clock.running ? (
            <Pause size={22} aria-hidden="true" />
          ) : (
            <Play size={22} aria-hidden="true" />
          )}
          {game.clock.running ? "Pause" : "Start clock"}
        </button>
        <button
          className="sub-button"
          type="button"
          disabled={game.benchIds.length === 0}
          onClick={() => setPlannerOpen(true)}
        >
          <ArrowRightLeft size={22} aria-hidden="true" />
          Plan subs
        </button>
        <button
          type="button"
          onClick={() => setMoveOpen(true)}
          disabled={fieldIds.length < 2}
        >
          <Pencil size={21} aria-hidden="true" />
          Positions
        </button>
        <button
          type="button"
          disabled={game.history.length === 0}
          onClick={() => safeChange(() => undoLastEvent(game))}
        >
          <RotateCcw size={21} aria-hidden="true" />
          Undo
        </button>
      </div>

      {plannerOpen && (
        <SubstitutionPlanner
          game={displayed}
          team={team}
          onClose={() => setPlannerOpen(false)}
          onConfirm={(pairs) => {
            safeChange(() =>
              applySubstitutions(game, pairs, team.sideSize, Date.now()),
            );
            setPlannerOpen(false);
          }}
        />
      )}
      {moveOpen && (
        <PositionEditor
          game={displayed}
          team={team}
          onClose={() => setMoveOpen(false)}
          onConfirm={(playerId, positionId) => {
            safeChange(() => movePlayer(game, playerId, positionId));
            setMoveOpen(false);
          }}
          onUnavailable={(playerId) => {
            safeChange(() =>
              markUnavailable(game, playerId, team.sideSize, Date.now()),
            );
            setMoveOpen(false);
          }}
        />
      )}
      {endConfirm && (
        <ConfirmSheet
          title="End this game?"
          body="The active game and its live clock will be closed. Your team roster and defaults stay saved."
          confirmLabel="End game"
          onCancel={() => setEndConfirm(false)}
          onConfirm={onEnd}
        />
      )}
    </div>
  );
}

function Pitch({
  formation,
  assignments,
  team,
  totals,
}: {
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  team: Team;
  totals: ActiveGame["totals"];
}) {
  return (
    <div className="pitch" aria-label={`${formation.name} formation`}>
      <div className="pitch-halfway" aria-hidden="true" />
      <div className="pitch-circle" aria-hidden="true" />
      <div className="pitch-box top" aria-hidden="true" />
      <div className="pitch-box bottom" aria-hidden="true" />
      {formation.positions.map((position) => {
        const playerId = assignments[position.id];
        const player = team.roster.find((item) => item.id === playerId);
        return (
          <div
            className={`pitch-player ${player ? "" : "empty"}`}
            key={position.id}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          >
            <span className="position-label">{position.shortLabel}</span>
            <strong>{player?.name ?? "Open"}</strong>
            <small>
              {player ? (
                <>
                  <span className="pitch-time">
                    {formatDuration(totals[player.id]?.fieldSeconds ?? 0)}
                  </span>
                  <span className="pitch-time-label"> played</span>
                </>
              ) : (
                position.label
              )}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function FormationDiagram({
  formation,
}: {
  formation: ReturnType<typeof getFormation>;
}) {
  return (
    <span className="formation-diagram" aria-hidden="true">
      <span className="formation-halfway" />
      <span className="formation-circle" />
      {formation.positions.map((position) => (
        <span
          className={`formation-dot ${position.role}`}
          key={position.id}
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          {position.shortLabel}
        </span>
      ))}
    </span>
  );
}

function PlayerTimeRow({
  player,
  primaryTime,
  primaryLabel,
  secondaryTime,
  secondaryLabel,
  onUnavailable,
}: {
  player: Player;
  primaryTime: number;
  primaryLabel: string;
  secondaryTime: number;
  secondaryLabel: string;
  onUnavailable: () => void;
}) {
  return (
    <div className="player-time-row">
      <span className="player-number">{player.number ?? "–"}</span>
      <span className="player-time-name">
        <strong>{player.name}</strong>
        <small>
          {formatDuration(secondaryTime)} {secondaryLabel}
        </small>
      </span>
      <span className="primary-time">
        <strong>{formatDuration(primaryTime)}</strong>
        <small>{primaryLabel}</small>
      </span>
      <button
        className="icon-button"
        type="button"
        onClick={onUnavailable}
        aria-label={`Mark ${player.name} unavailable`}
        title={`Mark ${player.name} unavailable`}
      >
        <UserRoundX size={20} />
      </button>
    </div>
  );
}

function SubstitutionPlanner({
  game,
  team,
  onClose,
  onConfirm,
}: {
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onConfirm: (pairs: SubstitutionPair[]) => void;
}) {
  const maxCount = Math.min(
    game.benchIds.length,
    Object.keys(game.assignments).length,
  );
  const [count, setCount] = useState(Math.min(1, maxCount));
  const [pairs, setPairs] = useState<SubstitutionPair[]>(() =>
    suggestSubstitutions(game, Math.min(1, maxCount)),
  );
  const formation = getFormation(game.formationId);

  const changeCount = (nextCount: number) => {
    setCount(nextCount);
    setPairs(suggestSubstitutions(game, nextCount));
  };
  const updatePair = (index: number, patch: Partial<SubstitutionPair>) =>
    setPairs((current) =>
      current.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, ...patch } : pair,
      ),
    );
  const duplicateOuts =
    new Set(pairs.map((pair) => pair.outPlayerId)).size !== pairs.length;
  const duplicateIns =
    new Set(pairs.map((pair) => pair.inPlayerId)).size !== pairs.length;
  const valid = pairs.length === count && !duplicateOuts && !duplicateIns;

  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        className="bottom-sheet substitution-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="substitution-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="substitution-title">Plan substitutions</h2>
            <p>
              Suggested for fairness. Override any player before confirming.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </header>

        <div className="sub-count">
          <span>Players to swap</span>
          <div className="stepper">
            {Array.from({ length: maxCount }, (_, index) => index + 1).map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  className={count === value ? "active" : ""}
                  onClick={() => changeCount(value)}
                >
                  {value}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="swap-list">
          {pairs.map((pair, index) => (
            <div className="swap-row" key={index}>
              <span className="swap-number">{index + 1}</span>
              <label>
                <span>OUT</span>
                <select
                  value={pair.outPlayerId}
                  onChange={(event) => {
                    const positionId =
                      Object.entries(game.assignments).find(
                        ([, id]) => id === event.target.value,
                      )?.[0] ?? pair.positionId;
                    updatePair(index, {
                      outPlayerId: event.target.value,
                      positionId,
                    });
                  }}
                >
                  {Object.entries(game.assignments).map(([positionId, id]) => (
                    <option value={id} key={id}>
                      {playerName(team, id)} ·{" "}
                      {
                        formation.positions.find(
                          (item) => item.id === positionId,
                        )?.shortLabel
                      }
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRightLeft size={22} aria-hidden="true" />
              <label>
                <span>IN</span>
                <select
                  value={pair.inPlayerId}
                  onChange={(event) =>
                    updatePair(index, { inPlayerId: event.target.value })
                  }
                >
                  {game.benchIds.map((id) => (
                    <option value={id} key={id}>
                      {playerName(team, id)} ·{" "}
                      {formatDuration(game.totals[id]?.benchSeconds ?? 0)} bench
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>

        {!valid && (
          <p className="error-message">
            Choose a different outgoing and incoming player for every swap.
          </p>
        )}

        <div className="review-checklist">
          <h3>Confirm together</h3>
          {pairs.map((pair, index) => (
            <div key={index}>
              <span className="out-label">OUT</span>
              <strong>{playerName(team, pair.outPlayerId)}</strong>
              <ArrowRightLeft size={17} aria-hidden="true" />
              <span className="in-label">IN</span>
              <strong>{playerName(team, pair.inPlayerId)}</strong>
            </div>
          ))}
        </div>

        <div className="sheet-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="sub-confirm"
            type="button"
            disabled={!valid}
            onClick={() => onConfirm(pairs)}
          >
            <Check size={21} aria-hidden="true" />
            Confirm {count} swap{count === 1 ? "" : "s"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PositionEditor({
  game,
  team,
  onClose,
  onConfirm,
  onUnavailable,
}: {
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onConfirm: (playerId: string, positionId: string) => void;
  onUnavailable: (playerId: string) => void;
}) {
  const formation = getFormation(game.formationId);
  const [playerId, setPlayerId] = useState(Object.values(game.assignments)[0]);
  const currentPosition =
    Object.entries(game.assignments).find(([, id]) => id === playerId)?.[0] ??
    formation.positions[0].id;
  const [positionId, setPositionId] = useState(currentPosition);

  useEffect(() => setPositionId(currentPosition), [playerId, currentPosition]);

  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        className="bottom-sheet compact-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="position-title">Change positions</h2>
            <p>Position changes do not count as substitutions.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </header>
        <label className="field">
          <span>Player</span>
          <select
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            {Object.entries(game.assignments).map(
              ([assignedPositionId, id]) => {
                const assignedPosition = formation.positions.find(
                  (position) => position.id === assignedPositionId,
                );
                return (
                  <option value={id} key={id}>
                    {playerName(team, id)} ({assignedPosition?.label})
                  </option>
                );
              },
            )}
          </select>
        </label>
        <label className="field">
          <span>Move to</span>
          <select
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
          >
            {formation.positions.map((position) => {
              const occupant = game.assignments[position.id];
              return (
                <option value={position.id} key={position.id}>
                  ({position.label}){" "}
                  {occupant ? playerName(team, occupant) : "Open"}
                </option>
              );
            })}
          </select>
        </label>
        <button
          className="unavailable-action"
          type="button"
          onClick={() => onUnavailable(playerId)}
        >
          <UserRoundX size={20} aria-hidden="true" />
          Mark {playerName(team, playerId)} unavailable
        </button>
        <div className="sheet-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => onConfirm(playerId, positionId)}
          >
            Save positions
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        className="bottom-sheet confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="sheet-actions">
          <button className="secondary-action" type="button" onClick={onCancel}>
            Keep game
          </button>
          <button className="danger-action" type="button" onClick={onConfirm}>
            <Square size={18} aria-hidden="true" /> {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function PageBack({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="back-button" type="button" onClick={onClick}>
      <ArrowLeft size={20} aria-hidden="true" /> {children}
    </button>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      <Clock3 size={32} aria-hidden="true" />
      <h1>{title}</h1>
      <p>{body}</p>
      <button className="primary-action" type="button" onClick={onAction}>
        {action} <ArrowRightLeft size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function SidelineMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="9" fill="currentColor" />
      <path d="M13 6v36" stroke="#fbfcf8" strokeWidth="2.5" />
      <path
        d="M13 15c6.5 0 11.5-3.5 14.5-9M13 33c6.5 0 11.5 3.5 14.5 9"
        fill="none"
        stroke="#fbfcf8"
        strokeWidth="2"
        opacity=".72"
      />
      <circle cx="30" cy="24" r="10.5" fill="#fbfcf8" />
      <path
        d="m30 18.3 4 2.9-1.5 4.7h-5l-1.5-4.7 4-2.9Zm-4 2.9-4.6-.2m6.1 4.9-2.9 3.8m7.9-3.8 2.9 3.8m-1.4-8.5 4.6-.2"
        fill="none"
        stroke="#d45c27"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle
        cx="30"
        cy="24"
        r="10.5"
        fill="none"
        stroke="#10282c"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TeamCrest({
  teamId,
  compact = false,
}: {
  teamId: TeamId;
  compact?: boolean;
}) {
  if (teamId === "u8") {
    return (
      <svg
        className={`team-crest golden-dragons ${compact ? "compact" : ""}`}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M32 3 55 12v18c0 14-8.8 24.2-23 31C17.8 54.2 9 44 9 30V12L32 3Z"
          fill="#f2c94c"
          stroke="#10282c"
          strokeWidth="3"
        />
        <path
          d="M19 39c6 3 16 1 18-5 1.7-5-3-7-7-5 1-5 5-8 11-8l-3-5c8 1 12 7 11 13-1 10-10 18-22 17l4 6c-7-1-11-5-12-13Z"
          fill="#0b6b63"
          stroke="#10282c"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="m39 22 6-7m-3 12 8-2"
          stroke="#fbfcf8"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle cx="39" cy="26" r="1.8" fill="#fbfcf8" />
        <text
          x="18"
          y="20"
          fill="#10282c"
          fontSize="9"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          U8
        </text>
      </svg>
    );
  }

  return (
    <svg
      className={`team-crest fireballers ${compact ? "compact" : ""}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 3 55 12v18c0 14-8.8 24.2-23 31C17.8 54.2 9 44 9 30V12L32 3Z"
        fill="#10282c"
        stroke="#10282c"
        strokeWidth="3"
      />
      <path
        d="M29 14c2 8-5 10-5 18 0 3 1 5 3 7-1-8 5-9 7-15 5 5 9 10 8 17 5-4 7-9 5-15 6 5 9 11 7 18-3 10-12 15-22 15S13 52 13 42c0-11 9-17 16-28Z"
        fill="#d45c27"
      />
      <circle
        cx="32"
        cy="42"
        r="12"
        fill="#fbfcf8"
        stroke="#10282c"
        strokeWidth="2"
      />
      <path
        d="m32 35 4 3-1.5 4.7h-5L28 38l4-3Zm-4 3-5-.5m6.5 5.2-3 4m8-4 3 4m-1.5-8.7 5-.5"
        fill="none"
        stroke="#d45c27"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <text
        x="15"
        y="20"
        fill="#fbfcf8"
        fontSize="9"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
      >
        U12
      </text>
    </svg>
  );
}

export default App;
