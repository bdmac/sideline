import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CirclePlus,
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
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applySubstitutions,
  assignPlayerToPosition,
  assignPlayersByPreference,
  cancelQueuedSubstitutions,
  createGame,
  formatDuration,
  getDisplayedSeconds,
  getFormation,
  getFormationsForTeam,
  getPeriodStatus,
  getScore,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  queueSubstitutions,
  recordGoal,
  setClockRunning,
  suggestSubstitutions,
  summarizePlayerPositions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import { loadState, saveState } from "./storage";
import type {
  ActiveGame,
  AppState,
  GameEvent,
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

const playerLabel = (team: Team, id: string) => {
  const player = team.roster.find((item) => item.id === id);
  if (!player) return "Unknown player";
  return player.number ? `#${player.number} ${player.name}` : player.name;
};

const preferredRoleLabel = (role: Player["preferredRoles"][number]) =>
  role === "goalkeeper"
    ? "Goalkeeper"
    : role === "defender"
      ? "Defense"
      : role === "midfielder"
        ? "Midfield"
        : "Forward";

let modalLockCount = 0;
let modalScrollY = 0;
let previousBodyStyles = {
  overflow: "",
  position: "",
  top: "",
  left: "",
  right: "",
  width: "",
};
let previousRootOverflow = "";

function ModalBackdrop({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (modalLockCount === 0) {
      modalScrollY = window.scrollY;
      previousBodyStyles = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
      };
      previousRootOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${modalScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }
    modalLockCount += 1;

    return () => {
      modalLockCount = Math.max(0, modalLockCount - 1);
      if (modalLockCount !== 0) return;

      document.documentElement.style.overflow = previousRootOverflow;
      Object.assign(document.body.style, previousBodyStyles);
      window.scrollTo({ top: modalScrollY, left: 0, behavior: "auto" });
    };
  }, []);

  return (
    <div className="sheet-backdrop" role="presentation">
      {children}
    </div>
  );
}

const formatPositionChange = (
  event: GameEvent,
  formation: ReturnType<typeof getFormation>,
  team: Team,
) => {
  if (!event.playerId || !event.fromPositionId || !event.toPositionId) {
    return event.note ?? "Positions updated";
  }

  const fromPosition = formation.positions.find(
    (position) => position.id === event.fromPositionId,
  );
  const toPosition = formation.positions.find(
    (position) => position.id === event.toPositionId,
  );
  const targetPlayerId = event.beforeAssignments[event.toPositionId];
  const movedPlayer = `${playerName(team, event.playerId)}: ${fromPosition?.label ?? event.fromPositionId} → ${toPosition?.label ?? event.toPositionId}`;

  return targetPlayerId
    ? `${movedPlayer} · ${playerName(team, targetPlayerId)}: ${toPosition?.label ?? event.toPositionId} → ${fromPosition?.label ?? event.fromPositionId}`
    : movedPlayer;
};

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
    <ModalBackdrop>
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
    </ModalBackdrop>
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
  const [setupStep, setSetupStep] = useState<0 | 1 | 2>(0);
  const [starterPositionId, setStarterPositionId] = useState<string | null>(
    null,
  );
  const formation = getFormation(formationId);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    assignPlayersByPreference(
      formation,
      activePlayers.map((player) => player.id),
      team.roster,
    ),
  );

  const changeFormation = (nextFormationId: string) => {
    const nextFormation = getFormation(nextFormationId);
    const present = activePlayers.filter((player) =>
      presentIds.includes(player.id),
    );
    setFormationId(nextFormationId);
    setAssignments(
      assignPlayersByPreference(
        nextFormation,
        present.map((player) => player.id),
        team.roster,
      ),
    );
  };

  const selectedIds = Object.values(assignments).filter(Boolean);
  const expectedOnField = team.sideSize;
  const assignmentCount = selectedIds.length;
  const benchIds = presentIds.filter((id) => !selectedIds.includes(id));
  const attendanceShortfall = Math.max(0, team.sideSize - presentIds.length);
  const canStart =
    presentIds.length >= team.sideSize && assignmentCount === expectedOnField;
  const setupSteps = [
    { label: "Attendance", detail: `${presentIds.length} here` },
    { label: "Formation", detail: formation.name },
    {
      label: "Starters",
      detail: `${assignmentCount}/${expectedOnField}`,
    },
  ] as const;

  const goToStep = (step: 0 | 1 | 2) => {
    setSetupStep(step);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const autoFillStarters = () => {
    const availableIds = activePlayers
      .filter((player) => presentIds.includes(player.id))
      .map((player) => player.id);
    setAssignments(
      assignPlayersByPreference(formation, availableIds, team.roster),
    );
  };

  const resetStarters = () =>
    setAssignments(
      Object.fromEntries(
        formation.positions.map((position) => [position.id, ""]),
      ),
    );

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
          <p>Set the squad, shape, and starters in three quick steps.</p>
        </div>
      </section>

      <div
        className="setup-progress"
        role="status"
        aria-label={`Step ${setupStep + 1} of 3: ${setupSteps[setupStep].label}`}
      >
        <span className="setup-progress-copy">
          <small>Step {setupStep + 1} of 3</small>
          <strong>{setupSteps[setupStep].label}</strong>
        </span>
        <span
          className={`setup-progress-detail ${
            setupStep === 0 && attendanceShortfall > 0 ? "danger" : ""
          }`}
        >
          {setupSteps[setupStep].detail}
        </span>
        <span className="setup-progress-track" aria-hidden="true">
          <span style={{ width: `${((setupStep + 1) / 3) * 100}%` }} />
        </span>
      </div>

      {setupStep === 0 && (
        <section className="setup-section setup-step-panel">
          <div className="section-title">
            <h2>Who is here?</h2>
            <span
              className={`attendance-count ${
                attendanceShortfall > 0 ? "short" : ""
              }`}
              aria-live="polite"
            >
              {presentIds.length} present
            </span>
          </div>
          {attendanceShortfall > 0 && (
            <p className="inline-warning attendance-warning" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              Short {attendanceShortfall}{" "}
              {attendanceShortfall === 1 ? "player" : "players"}:{" "}
              {presentIds.length} present, {team.sideSize} required to start
              this {team.sideSize}v{team.sideSize} game.
            </p>
          )}
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
        </section>
      )}

      {setupStep === 1 && (
        <section className="setup-section setup-step-panel">
          <div className="section-title">
            <h2>Choose the formation</h2>
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
          {team.id === "u8" && (
            <label className="field setup-format">
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
          )}
        </section>
      )}

      {setupStep === 2 && (
        <section className="setup-section setup-step-panel">
          <div className="section-title">
            <div>
              <h2>Assign starters</h2>
              <p className="section-hint">
                Tap a position to change its player.
              </p>
            </div>
            <span>
              {assignmentCount}/{expectedOnField} assigned
            </span>
          </div>
          <div className="starter-tools">
            <button
              className="secondary-action"
              type="button"
              disabled={assignmentCount === expectedOnField}
              onClick={autoFillStarters}
            >
              Auto-fill
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={resetStarters}
            >
              Reset
            </button>
          </div>
          <StarterPitch
            formation={formation}
            assignments={assignments}
            team={team}
            onChoosePosition={setStarterPositionId}
          />
          <div className="bench-preview">
            <strong>Starting bench</strong>
            {benchIds.length ? (
              <ul className="starter-bench-list">
                {benchIds.map((id) => (
                  <li key={id}>{playerName(team, id)}</li>
                ))}
              </ul>
            ) : (
              <span>No bench — exactly enough players</span>
            )}
          </div>
        </section>
      )}

      <div className="setup-submit">
        {setupStep > 0 && (
          <button
            className="secondary-action setup-back"
            type="button"
            onClick={() => goToStep((setupStep - 1) as 0 | 1)}
          >
            <ArrowLeft size={20} aria-hidden="true" />{" "}
            {setupSteps[setupStep - 1].label}
          </button>
        )}
        {setupStep < 2 ? (
          <button
            className="primary-action"
            type="button"
            onClick={() => goToStep((setupStep + 1) as 1 | 2)}
          >
            {setupSteps[setupStep + 1].label}
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        ) : (
          <button
            className="primary-action"
            type="button"
            disabled={!canStart}
            onClick={start}
          >
            <Play size={22} aria-hidden="true" /> Start game
          </button>
        )}
        <span>
          Step {setupStep + 1} of 3
          {setupStep === 2 && !canStart && presentIds.length > 0
            ? ` · Fill all ${team.sideSize} positions`
            : ""}
        </span>
      </div>

      {starterPositionId && (
        <StarterPicker
          positionId={starterPositionId}
          formation={formation}
          assignments={assignments}
          presentPlayers={activePlayers.filter((player) =>
            presentIds.includes(player.id),
          )}
          onClose={() => setStarterPositionId(null)}
          onSelect={(playerId) => {
            setAssignments((current) =>
              assignPlayerToPosition(current, starterPositionId, playerId),
            );
            setStarterPositionId(null);
          }}
          onClear={() => {
            setAssignments((current) => ({
              ...current,
              [starterPositionId]: "",
            }));
            setStarterPositionId(null);
          }}
        />
      )}
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
  const [headerCollapseProgress, setHeaderCollapseProgress] = useState(0);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [queuedPlanOpen, setQueuedPlanOpen] = useState(false);
  const [goalScorerOpen, setGoalScorerOpen] = useState(false);
  const [confirmedPairs, setConfirmedPairs] = useState<
    SubstitutionPair[] | null
  >(null);
  const [confirmedEntry, setConfirmedEntry] = useState<{
    playerId: string;
    positionId: string;
  } | null>(null);
  const [positionEditorPlayerId, setPositionEditorPlayerId] = useState<
    string | null
  >(null);
  const [endConfirm, setEndConfirm] = useState(false);
  const [endedGame, setEndedGame] = useState<ActiveGame | null>(null);
  const [error, setError] = useState("");
  const formation = getFormation(game.formationId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateHeader = () =>
      setHeaderCollapseProgress(
        Math.min(1, Math.max(0, (window.scrollY - 32) / 96)),
      );
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
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
  const score = getScore(game);
  const validationErrors = validateGame(game, team.sideSize);
  const queuedPairs = game.queuedSubstitutions ?? [];
  const queuedPlanErrors = validateSubstitutionPairs(game, queuedPairs);
  const compactHeaderInteractive = headerCollapseProgress > 0.8;
  const periodBreak = displayed.periodBreak;

  useEffect(() => {
    if (game.clock.running && !displayed.clock.running && periodBreak) {
      onChange(displayed);
    }
  }, [displayed, game.clock.running, onChange, periodBreak]);

  const safeChange = (change: () => ActiveGame) => {
    try {
      setError("");
      onChange(change());
      return true;
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Could not update game",
      );
      return false;
    }
  };

  const handleUnavailable = (playerId: string) => {
    let replacementPairs: SubstitutionPair[] = [];
    if (
      !safeChange(() => {
        const nextGame = markUnavailable(
          game,
          playerId,
          team.sideSize,
          Date.now(),
        );
        const event = nextGame.history.at(-1);
        if (event?.type === "unavailable") {
          replacementPairs = event.pairs.map((pair) => ({ ...pair }));
        }
        return nextGame;
      })
    ) {
      return false;
    }

    if (replacementPairs.length > 0) {
      setConfirmedPairs(replacementPairs);
    }
    return true;
  };

  const handleAvailable = (playerId: string) => {
    let entryPositionId: string | null = null;
    if (
      !safeChange(() => {
        const nextGame = markAvailable(
          game,
          playerId,
          team.sideSize,
          Date.now(),
        );
        entryPositionId =
          Object.entries(nextGame.assignments).find(
            ([, assignedPlayerId]) => assignedPlayerId === playerId,
          )?.[0] ?? null;
        return nextGame;
      })
    ) {
      return;
    }

    if (entryPositionId) {
      setConfirmedEntry({ playerId, positionId: entryPositionId });
    }
  };

  const executeQueuedSubstitutions = () => {
    if (
      queuedPairs.length > 0 &&
      safeChange(() =>
        applySubstitutions(game, queuedPairs, team.sideSize, Date.now()),
      )
    ) {
      setQueuedPlanOpen(false);
    }
  };

  if (endedGame) {
    return (
      <GameSummary
        game={endedGame}
        team={team}
        onClose={() => {
          setEndedGame(null);
          onEnd();
        }}
      />
    );
  }

  return (
    <div className="live-page">
      <div className="live-match-status" aria-hidden={compactHeaderInteractive}>
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
            <span>End game</span>
          </button>
        </header>

        <section className="match-metrics" aria-label="Match status">
          <div className="game-clock" aria-label="Game clock">
            <span
              className={`clock-state ${game.clock.running ? "running" : ""}`}
            >
              {game.clock.running ? "Clock running" : "Clock paused"}
            </span>
            <strong>{formatDuration(displayed.clock.elapsedSeconds)}</strong>
          </div>

          <div className="scoreboard" aria-label="Score">
            <div className="scoreboard-score" aria-live="polite">
              <span>
                <small>Us</small>
                <strong>{score.us}</strong>
              </span>
              <span className="score-divider" aria-hidden="true">
                –
              </span>
              <span>
                <small>Opponent</small>
                <strong>{score.opponent}</strong>
              </span>
            </div>
          </div>

          <div className="clock-secondary">
            <span>
              <small>
                {period.label} {period.current} of {period.count}
              </small>
              <strong>
                {remaining > 0
                  ? `${formatDuration(remaining)} left`
                  : "Duration reached"}
              </strong>
            </span>
            <span>
              {formatDuration(period.remainingSeconds)} left in{" "}
              {period.label.toLowerCase()}
            </span>
          </div>
        </section>
      </div>

      <div
        className={`compact-match-header ${
          compactHeaderInteractive ? "interactive" : ""
        }`}
        style={{
          opacity: headerCollapseProgress,
          transform: `translateY(${(1 - headerCollapseProgress) * -14}px)`,
        }}
        aria-hidden={!compactHeaderInteractive}
      >
        <strong className="compact-match-team">{team.name}</strong>
        <span className="compact-match-clock">
          <strong>{formatDuration(displayed.clock.elapsedSeconds)}</strong>
          <small>{formatDuration(remaining)} left</small>
        </span>
        <span className="compact-match-score" aria-label="Score">
          {score.us} – {score.opponent}
        </span>
        <button
          className="danger-action end-game-button"
          type="button"
          tabIndex={compactHeaderInteractive ? 0 : -1}
          onClick={() => setEndConfirm(true)}
        >
          <Square size={18} aria-hidden="true" />
          <span>End game</span>
        </button>
      </div>

      {periodBreak && (
        <section
          className={`period-break-banner ${periodBreak.final ? "final" : ""}`}
          aria-label={
            periodBreak.final
              ? "Regulation time complete"
              : `End of ${period.label} ${periodBreak.completedPeriod}`
          }
        >
          <span>
            <strong>
              {periodBreak.final
                ? "Regulation time complete"
                : `End of ${period.label} ${periodBreak.completedPeriod}`}
            </strong>
            <small>
              Clock paused at {formatDuration(displayed.clock.elapsedSeconds)}
            </small>
          </span>
          <div>
            {!periodBreak.final &&
              (queuedPairs.length > 0 ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setQueuedPlanOpen(true)}
                >
                  <ArrowRightLeft size={18} aria-hidden="true" />
                  Review queued subs
                </button>
              ) : game.benchIds.length > 0 ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setPlannerOpen(true)}
                >
                  <ArrowRightLeft size={18} aria-hidden="true" />
                  Plan rotation
                </button>
              ) : null)}
            <button
              className={periodBreak.final ? "danger-action" : "primary-action"}
              type="button"
              onClick={() =>
                periodBreak.final
                  ? setEndConfirm(true)
                  : safeChange(() => setClockRunning(game, true, Date.now()))
              }
            >
              {periodBreak.final ? (
                <Square size={18} aria-hidden="true" />
              ) : (
                <Play size={18} aria-hidden="true" />
              )}
              {periodBreak.final
                ? "End game"
                : `Start ${period.label} ${periodBreak.completedPeriod + 1}`}
            </button>
          </div>
        </section>
      )}

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
      {queuedPairs.length > 0 && (
        <section
          className={`queued-substitution-banner ${
            queuedPlanErrors.length ? "invalid" : ""
          }`}
          aria-label="Queued substitutions"
        >
          <span>
            <strong>
              {queuedPairs.length} substitution
              {queuedPairs.length === 1 ? "" : "s"} queued
            </strong>
            <small>
              {queuedPlanErrors.length
                ? "Plan needs attention before execution"
                : "Lineup and timers have not changed"}
            </small>
          </span>
          <div>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setQueuedPlanOpen(true)}
            >
              <ArrowRightLeft size={18} aria-hidden="true" />
              Review
            </button>
            <button
              className="sub-confirm"
              type="button"
              disabled={queuedPlanErrors.length > 0}
              onClick={executeQueuedSubstitutions}
            >
              <Check size={18} aria-hidden="true" />
              Execute
            </button>
          </div>
        </section>
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
            onEditPlayer={setPositionEditorPlayerId}
            onMovePlayer={(playerId, positionId) =>
              safeChange(() =>
                movePlayer(game, playerId, positionId, Date.now()),
              )
            }
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
                  onUnavailable={() => handleUnavailable(id)}
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
                      onClick={() => handleAvailable(id)}
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

      <GameLog
        game={game}
        formation={formation}
        team={team}
        onUndo={() => safeChange(() => undoLastEvent(game))}
      />

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
          {game.clock.running
            ? "Pause"
            : periodBreak && !periodBreak.final
              ? `Start ${period.label} ${periodBreak.completedPeriod + 1}`
              : periodBreak?.final
                ? "Continue clock"
                : "Start clock"}
        </button>
        <button
          className={`sub-button ${queuedPairs.length ? "queued" : ""}`}
          type="button"
          disabled={game.benchIds.length === 0 && queuedPairs.length === 0}
          onClick={() =>
            queuedPairs.length ? setQueuedPlanOpen(true) : setPlannerOpen(true)
          }
        >
          <ArrowRightLeft size={22} aria-hidden="true" />
          {queuedPairs.length ? "Queued subs" : "Plan subs"}
        </button>
        <button
          type="button"
          onClick={() => setPositionEditorPlayerId(fieldIds[0])}
          disabled={fieldIds.length < 2}
        >
          <Pencil size={21} aria-hidden="true" />
          Positions
        </button>
        <button
          className="score-button"
          type="button"
          onClick={() => setGoalScorerOpen(true)}
        >
          <CirclePlus size={21} aria-hidden="true" />
          Score
        </button>
      </div>

      {plannerOpen && (
        <SubstitutionPlanner
          game={displayed}
          team={team}
          initialPairs={game.queuedSubstitutions}
          onClose={() => setPlannerOpen(false)}
          onConfirm={(pairs) => {
            if (safeChange(() => queueSubstitutions(game, pairs))) {
              setPlannerOpen(false);
              setQueuedPlanOpen(true);
            }
          }}
        />
      )}
      {queuedPlanOpen && queuedPairs.length > 0 && (
        <QueuedSubstitutionSummary
          pairs={queuedPairs}
          formation={formation}
          team={team}
          errors={queuedPlanErrors}
          onClose={() => setQueuedPlanOpen(false)}
          onEdit={() => {
            setQueuedPlanOpen(false);
            setPlannerOpen(true);
          }}
          onCancel={() => {
            safeChange(() => cancelQueuedSubstitutions(game));
            setQueuedPlanOpen(false);
          }}
          onExecute={executeQueuedSubstitutions}
        />
      )}
      {goalScorerOpen && (
        <GoalScorerPicker
          playerIds={fieldIds}
          team={team}
          score={score}
          onClose={() => setGoalScorerOpen(false)}
          onSelect={(playerId) => {
            if (
              safeChange(() => recordGoal(game, "us", playerId, Date.now()))
            ) {
              setGoalScorerOpen(false);
            }
          }}
          onOpponentGoal={() => {
            if (
              safeChange(() =>
                recordGoal(game, "opponent", undefined, Date.now()),
              )
            ) {
              setGoalScorerOpen(false);
            }
          }}
        />
      )}
      {confirmedPairs && (
        <SubstitutionSummary
          pairs={confirmedPairs}
          formation={formation}
          team={team}
          onClose={() => setConfirmedPairs(null)}
        />
      )}
      {confirmedEntry && (
        <PlayerEntrySummary
          entry={confirmedEntry}
          formation={formation}
          team={team}
          onClose={() => setConfirmedEntry(null)}
        />
      )}
      {positionEditorPlayerId && (
        <PositionEditor
          game={displayed}
          team={team}
          initialPlayerId={positionEditorPlayerId}
          onClose={() => setPositionEditorPlayerId(null)}
          onConfirm={(playerId, positionId) => {
            safeChange(() => movePlayer(game, playerId, positionId));
            setPositionEditorPlayerId(null);
          }}
          onUnavailable={(playerId) => {
            if (handleUnavailable(playerId)) {
              setPositionEditorPlayerId(null);
            }
          }}
        />
      )}
      {endConfirm && (
        <ConfirmSheet
          title="End this game?"
          body="The clock will stop and you’ll see a player summary before returning to team selection."
          confirmLabel="End game"
          onCancel={() => setEndConfirm(false)}
          onConfirm={() => {
            const finalGame = cancelQueuedSubstitutions(
              setClockRunning(game, false, Date.now()),
            );
            onChange(finalGame);
            setEndConfirm(false);
            setEndedGame(finalGame);
          }}
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
  onEditPlayer,
  onMovePlayer,
}: {
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  team: Team;
  totals: ActiveGame["totals"];
  onEditPlayer: (playerId: string) => void;
  onMovePlayer: (playerId: string, positionId: string) => void;
}) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    playerId: string;
    sourcePositionId: string;
    targetPositionId: string | null;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    dragging: boolean;
  } | null>(null);
  const [dragState, setDragState] = useState(dragRef.current);
  const suppressClickRef = useRef(false);

  const updateDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    playerId: string,
    sourcePositionId: string,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.playerId !== playerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const dragging = drag.dragging || Math.hypot(deltaX, deltaY) > 8;
    if (!dragging) return;

    const bounds = pitchRef.current?.getBoundingClientRect();
    let targetPositionId: string | null = null;
    if (
      bounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    ) {
      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      const target = formation.positions.reduce(
        (closest, position) => {
          const distance = Math.hypot(position.x - x, position.y - y);
          return distance < closest.distance
            ? { id: position.id, distance }
            : closest;
        },
        { id: sourcePositionId, distance: Number.POSITIVE_INFINITY },
      );
      targetPositionId = target.id === sourcePositionId ? null : target.id;
    }

    const nextDrag = {
      ...drag,
      targetPositionId,
      deltaX,
      deltaY,
      dragging: true,
    };
    dragRef.current = nextDrag;
    setDragState(nextDrag);
    event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.dragging) {
      event.preventDefault();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (drag.targetPositionId) {
        onMovePlayer(drag.playerId, drag.targetPositionId);
      }
    }
    dragRef.current = null;
    setDragState(null);
  };

  return (
    <div
      className="pitch"
      aria-label={`${formation.name} formation`}
      ref={pitchRef}
    >
      <div className="pitch-halfway" aria-hidden="true" />
      <div className="pitch-circle" aria-hidden="true" />
      <div className="pitch-box top" aria-hidden="true" />
      <div className="pitch-box bottom" aria-hidden="true" />
      {formation.positions.map((position) => {
        const playerId = assignments[position.id];
        const player = team.roster.find((item) => item.id === playerId);
        const content = (
          <>
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
          </>
        );
        const style = {
          left: `${position.x}%`,
          top: `${position.y}%`,
          ...(dragState?.sourcePositionId === position.id && dragState.dragging
            ? {
                transform: `translate(calc(-50% + ${dragState.deltaX}px), calc(-50% + ${dragState.deltaY}px))`,
              }
            : {}),
        };

        return player ? (
          <button
            type="button"
            className={`pitch-player ${
              dragState?.sourcePositionId === position.id && dragState.dragging
                ? "dragging"
                : ""
            } ${
              dragState?.targetPositionId === position.id ? "drop-target" : ""
            }`}
            key={position.id}
            style={style}
            data-position-id={position.id}
            aria-label={`Change ${player.name}'s position`}
            title="Tap to edit or drag to another position"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              const nextDrag = {
                playerId: player.id,
                sourcePositionId: position.id,
                targetPositionId: null,
                startX: event.clientX,
                startY: event.clientY,
                deltaX: 0,
                deltaY: 0,
                dragging: false,
              };
              dragRef.current = nextDrag;
              setDragState(nextDrag);
            }}
            onPointerMove={(event) => updateDrag(event, player.id, position.id)}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                suppressClickRef.current = false;
                return;
              }
              onEditPlayer(player.id);
            }}
          >
            {content}
          </button>
        ) : (
          <div
            className={`pitch-player ${player ? "" : "empty"}`}
            key={position.id}
            style={style}
            data-position-id={position.id}
          >
            {content}
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

function StarterPitch({
  formation,
  assignments,
  team,
  onChoosePosition,
}: {
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  team: Team;
  onChoosePosition: (positionId: string) => void;
}) {
  return (
    <div
      className="pitch starter-pitch"
      aria-label={`${formation.name} starter assignments`}
    >
      <div className="pitch-halfway" aria-hidden="true" />
      <div className="pitch-circle" aria-hidden="true" />
      <div className="pitch-box top" aria-hidden="true" />
      <div className="pitch-box bottom" aria-hidden="true" />
      {formation.positions.map((position) => {
        const playerId = assignments[position.id];
        const player = team.roster.find((item) => item.id === playerId);
        return (
          <button
            type="button"
            className={`pitch-player starter-slot ${player ? "" : "empty"}`}
            key={position.id}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            aria-label={`${player ? `Change ${player.name}` : "Assign player"} at ${position.label}`}
            onClick={() => onChoosePosition(position.id)}
          >
            <span className="position-label">{position.shortLabel}</span>
            <strong>{player?.name ?? "Open"}</strong>
          </button>
        );
      })}
    </div>
  );
}

function StarterPicker({
  positionId,
  formation,
  assignments,
  presentPlayers,
  onClose,
  onSelect,
  onClear,
}: {
  positionId: string;
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  presentPlayers: Player[];
  onClose: () => void;
  onSelect: (playerId: string) => void;
  onClear: () => void;
}) {
  const position = formation.positions.find((item) => item.id === positionId);
  const currentPlayerId = assignments[positionId];
  const choices = presentPlayers.filter(
    (player) => player.id !== currentPlayerId,
  );

  return (
    <ModalBackdrop>
      <section
        className="bottom-sheet compact-sheet starter-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="starter-picker-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="starter-picker-title">
              Choose {position?.label ?? "position"}
            </h2>
            <p>Choosing another starter swaps their positions.</p>
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

        <div className="starter-choice-list">
          {choices.map((player) => {
            const assignedPosition = Object.entries(assignments).find(
              ([, assignedPlayerId]) => assignedPlayerId === player.id,
            )?.[0];
            const assignedLabel = assignedPosition
              ? formation.positions.find((item) => item.id === assignedPosition)
                  ?.label
              : null;
            const assignedShortLabel = assignedPosition
              ? formation.positions.find((item) => item.id === assignedPosition)
                  ?.shortLabel
              : null;
            return (
              <button
                type="button"
                key={player.id}
                onClick={() => onSelect(player.id)}
              >
                <span className="starter-choice-player">
                  <strong>{player.name}</strong>
                  <span className="starter-preferences">
                    <small>Prefers</small>
                    <span>
                      {player.preferredRoles
                        .map(preferredRoleLabel)
                        .join(" · ")}
                    </span>
                  </span>
                </span>
                <span
                  className={`starter-current-assignment ${
                    assignedPosition ? "" : "bench"
                  }`}
                  aria-label={
                    assignedLabel
                      ? `Currently ${assignedLabel}`
                      : "Currently on starting bench"
                  }
                >
                  <small>Current</small>
                  <strong>{assignedShortLabel ?? "Bench"}</strong>
                </span>
              </button>
            );
          })}
        </div>

        <div className="sheet-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancel
          </button>
          {currentPlayerId && (
            <button className="quiet-button" type="button" onClick={onClear}>
              Leave open
            </button>
          )}
        </div>
      </section>
    </ModalBackdrop>
  );
}

function GoalScorerPicker({
  playerIds,
  team,
  score,
  onClose,
  onSelect,
  onOpponentGoal,
}: {
  playerIds: string[];
  team: Team;
  score: { us: number; opponent: number };
  onClose: () => void;
  onSelect: (playerId: string) => void;
  onOpponentGoal: () => void;
}) {
  return (
    <ModalBackdrop>
      <section
        className="bottom-sheet compact-sheet scorekeeper-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scorekeeper-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="scorekeeper-title">Record a goal</h2>
            <p>
              {team.name} {score.us} – {score.opponent} Opponent
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

        <h3>Who scored for us?</h3>
        <div className="goal-scorer-grid">
          {playerIds.map((playerId) => (
            <button
              className="secondary-action"
              type="button"
              key={playerId}
              onClick={() => onSelect(playerId)}
            >
              <CirclePlus size={18} aria-hidden="true" />
              {playerLabel(team, playerId)}
            </button>
          ))}
        </div>

        <button
          className="secondary-action opponent-goal-action"
          type="button"
          onClick={onOpponentGoal}
        >
          <CirclePlus size={19} aria-hidden="true" />
          Opponent scored
        </button>
      </section>
    </ModalBackdrop>
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
  initialPairs,
  onClose,
  onConfirm,
}: {
  game: ActiveGame;
  team: Team;
  initialPairs?: SubstitutionPair[];
  onClose: () => void;
  onConfirm: (pairs: SubstitutionPair[]) => void;
}) {
  const maxCount = Math.min(
    game.benchIds.length,
    Object.keys(game.assignments).length,
  );
  const initialCount = initialPairs?.length ?? maxCount;
  const [count, setCount] = useState(initialCount);
  const [pairs, setPairs] = useState<SubstitutionPair[]>(
    () =>
      initialPairs?.map((pair) => ({ ...pair })) ??
      suggestSubstitutions(game, maxCount, team),
  );
  const formation = getFormation(game.formationId);

  const changeCount = (nextCount: number) => {
    setCount(nextCount);
    setPairs(suggestSubstitutions(game, nextCount, team));
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
  const pairErrors = validateSubstitutionPairs(game, pairs);
  const valid =
    pairs.length === count &&
    !duplicateOuts &&
    !duplicateIns &&
    pairErrors.length === 0;

  return (
    <ModalBackdrop>
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
              Suggested for fairness. Queue the plan now, then execute it when
              the players enter.
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
              <ArrowRightLeft
                className="swap-direction"
                size={22}
                aria-hidden="true"
              />
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
                      {formatDuration(game.totals[id]?.benchSeconds ?? 0)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>

        {!valid && (
          <p className="error-message">
            {pairErrors[0] ??
              "Choose a different outgoing and incoming player for every swap."}
          </p>
        )}

        <div className="review-checklist">
          <h3>Confirm together</h3>
          {pairs.map((pair, index) => (
            <div key={index}>
              <span className="out-label">OUT</span>
              <strong>{playerName(team, pair.outPlayerId)}</strong>
              <ArrowRightLeft
                className="review-direction"
                size={17}
                aria-hidden="true"
              />
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
            Queue {count} swap{count === 1 ? "" : "s"}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

function ReadySwapList({
  pairs,
  formation,
  team,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
}) {
  return (
    <div className="ready-swap-list">
      {pairs.map((pair, index) => {
        const position = formation.positions.find(
          (item) => item.id === pair.positionId,
        );
        return (
          <div className="ready-swap" key={index}>
            <span className="ready-player out">
              <small>OUT</small>
              <strong>{playerLabel(team, pair.outPlayerId)}</strong>
            </span>
            <span className="ready-direction">
              <ArrowRightLeft size={24} aria-hidden="true" />
              <small>{position?.shortLabel}</small>
            </span>
            <span className="ready-player in">
              <small>IN</small>
              <strong>{playerLabel(team, pair.inPlayerId)}</strong>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function QueuedSubstitutionSummary({
  pairs,
  formation,
  team,
  errors,
  onClose,
  onEdit,
  onCancel,
  onExecute,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  errors: string[];
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onExecute: () => void;
}) {
  return (
    <ModalBackdrop>
      <section
        className="bottom-sheet substitution-ready-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="queued-substitution-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="queued-substitution-title">Substitutions queued</h2>
            <p>
              Get these players ready. Timers and positions change only when you
              execute.
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

        <ReadySwapList pairs={pairs} formation={formation} team={team} />

        {errors.length > 0 && (
          <div className="queued-plan-error" role="alert">
            <CircleAlert size={20} aria-hidden="true" />
            <span>
              <strong>Plan needs attention</strong>
              <small>{errors.join(". ")}</small>
            </span>
          </div>
        )}

        <div className="queued-plan-actions">
          <button className="secondary-action" type="button" onClick={onEdit}>
            <Pencil size={18} aria-hidden="true" />
            Edit plan
          </button>
          <button
            className="secondary-action cancel-plan-action"
            type="button"
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
            Cancel plan
          </button>
          <button
            className="sub-confirm"
            type="button"
            disabled={errors.length > 0}
            onClick={onExecute}
          >
            <Check size={21} aria-hidden="true" />
            Execute subs
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

function SubstitutionSummary({
  pairs,
  formation,
  team,
  onClose,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  onClose: () => void;
}) {
  return (
    <ModalBackdrop>
      <section
        className="bottom-sheet substitution-ready-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="substitution-ready-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="substitution-ready-title">Substitution ready</h2>
            <p>The game is updated. Organize these players together.</p>
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

        <ReadySwapList pairs={pairs} formation={formation} team={team} />

        <button className="primary-action" type="button" onClick={onClose}>
          Done
        </button>
      </section>
    </ModalBackdrop>
  );
}

function PlayerEntrySummary({
  entry,
  formation,
  team,
  onClose,
}: {
  entry: { playerId: string; positionId: string };
  formation: ReturnType<typeof getFormation>;
  team: Team;
  onClose: () => void;
}) {
  const position = formation.positions.find(
    (item) => item.id === entry.positionId,
  );

  return (
    <ModalBackdrop>
      <section
        className="bottom-sheet substitution-ready-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-ready-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="player-ready-title">Player ready</h2>
            <p>The game is updated. Send this player onto the field.</p>
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

        <div className="ready-entry">
          <span className="ready-player in">
            <small>IN</small>
            <strong>{playerLabel(team, entry.playerId)}</strong>
          </span>
          <span className="ready-position">
            <small>POSITION</small>
            <strong>{position?.label ?? "Open position"}</strong>
          </span>
        </div>

        <button className="primary-action" type="button" onClick={onClose}>
          Done
        </button>
      </section>
    </ModalBackdrop>
  );
}

function GameSummary({
  game,
  team,
  onClose,
}: {
  game: ActiveGame;
  team: Team;
  onClose: () => void;
}) {
  const formation = getFormation(game.formationId);
  const summaries = summarizePlayerPositions(game);

  return (
    <div className="game-summary-page">
      <header className="match-header game-summary-header">
        <div>
          <TeamCrest teamId={team.id} compact />
          <span>
            <strong>{team.name}</strong>
            <small>Match complete</small>
          </span>
        </div>
      </header>

      <main
        className="game-summary-content"
        aria-labelledby="game-summary-title"
      >
        <header className="game-summary-intro">
          <span className="eyebrow">Final report</span>
          <h1 id="game-summary-title">Game summary</h1>
          <p>
            {formation.name} formation ·{" "}
            {formatDuration(game.clock.elapsedSeconds)} played
          </p>
          <div className="final-score" aria-label="Final score">
            <span>{team.name}</span>
            <strong>
              {getScore(game).us} – {getScore(game).opponent}
            </strong>
            <span>Opponent</span>
          </div>
        </header>

        <ol className="player-game-summaries">
          {summaries.map((summary) => {
            const player = team.roster.find(
              (item) => item.id === summary.playerId,
            );
            return (
              <li key={summary.playerId}>
                <div className="player-summary-heading">
                  <strong>{player?.name ?? "Unknown player"}</strong>
                  <span>{formatDuration(summary.totalSeconds)} total</span>
                </div>
                {summary.positions.length ? (
                  <ul>
                    {summary.positions.map((positionTime) => (
                      <li key={positionTime.positionId}>
                        <span>
                          {formation.positions.find(
                            (position) =>
                              position.id === positionTime.positionId,
                          )?.label ?? positionTime.positionId}
                        </span>
                        <strong>{formatDuration(positionTime.seconds)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small>Did not enter the field</small>
                )}
              </li>
            );
          })}
        </ol>

        <GameLog game={game} formation={formation} team={team} />
      </main>

      <footer className="game-summary-actions">
        <button className="primary-action" type="button" onClick={onClose}>
          Return to teams
        </button>
      </footer>
    </div>
  );
}

function GameLog({
  game,
  formation,
  team,
  onUndo,
}: {
  game: ActiveGame;
  formation: ReturnType<typeof getFormation>;
  team: Team;
  onUndo?: () => void;
}) {
  return (
    <details className="game-log">
      <summary className="game-log-summary">
        <span>
          <strong>Game log</strong>
          <small>Review confirmed game changes</small>
        </span>
        <span>{game.history.length} events</span>
      </summary>
      <div className="game-log-content">
        {game.history.length ? (
          <ol>
            {[...game.history].reverse().map((event) => {
              const eventPlayer = event.playerId
                ? playerName(team, event.playerId)
                : null;
              const eventTitle =
                event.type === "goal-for"
                  ? `${eventPlayer ?? "Player"} scored`
                  : event.type === "goal-against"
                    ? "Opponent scored"
                    : event.type === "substitution"
                      ? `${event.pairs.length} substitution${event.pairs.length === 1 ? "" : "s"}`
                      : event.type === "position-change"
                        ? "Position change"
                        : event.type === "available"
                          ? `${eventPlayer ?? "Player"} available`
                          : `${eventPlayer ?? "Player"} unavailable`;
              const eventDetail =
                event.type === "goal-for"
                  ? `Goal for ${team.name}`
                  : event.type === "goal-against"
                    ? "Opponent goal"
                    : event.type === "position-change"
                      ? formatPositionChange(event, formation, team)
                      : event.pairs.length
                        ? event.pairs
                            .map(
                              (pair) =>
                                `${playerName(team, pair.outPlayerId)} → ${playerName(team, pair.inPlayerId)}`,
                            )
                            .join(" · ")
                        : event.note;
              return (
                <li key={event.id}>
                  <time>{formatDuration(event.atSeconds)}</time>
                  <span>
                    <strong>{eventTitle}</strong>
                    <small>{eventDetail}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty-copy">Confirmed changes will appear here.</p>
        )}
        {onUndo && game.history.length > 0 && (
          <button
            className="secondary-action game-log-undo"
            type="button"
            onClick={onUndo}
          >
            <RotateCcw size={18} aria-hidden="true" />
            Undo last change
          </button>
        )}
      </div>
    </details>
  );
}

function PositionEditor({
  game,
  team,
  initialPlayerId,
  onClose,
  onConfirm,
  onUnavailable,
}: {
  game: ActiveGame;
  team: Team;
  initialPlayerId: string;
  onClose: () => void;
  onConfirm: (playerId: string, positionId: string) => void;
  onUnavailable: (playerId: string) => void;
}) {
  const formation = getFormation(game.formationId);
  const initialSelectedPlayerId = Object.values(game.assignments).includes(
    initialPlayerId,
  )
    ? initialPlayerId
    : Object.values(game.assignments)[0];
  const [playerId, setPlayerId] = useState(initialSelectedPlayerId);
  const targetPositions = formation.positions.filter(
    (position) => game.assignments[position.id] !== playerId,
  );
  const [positionId, setPositionId] = useState(
    formation.positions.find(
      (position) => game.assignments[position.id] !== initialSelectedPlayerId,
    )?.id ?? "",
  );

  return (
    <ModalBackdrop>
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
            onChange={(event) => {
              const nextPlayerId = event.target.value;
              const firstTarget = formation.positions.find(
                (position) => game.assignments[position.id] !== nextPlayerId,
              );
              setPlayerId(nextPlayerId);
              setPositionId(firstTarget?.id ?? "");
            }}
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
            {targetPositions.map((position) => {
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
    </ModalBackdrop>
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
    <ModalBackdrop>
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
    </ModalBackdrop>
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
