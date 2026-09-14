import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CirclePlus,
  Clock3,
  Download,
  MoreHorizontal,
  Move,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
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
  addGuestPlayer,
  applySubstitutions,
  assignPlayerToPosition,
  assignPlayersByPreference,
  cancelQueuedSubstitutions,
  createGame,
  formatDuration,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getDisplayedSeconds,
  getFormation,
  getFormationsForTeam,
  getPeriodStatus,
  getRecommendedSubstitutionCount,
  getScore,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  queueBenchSubstitution,
  queueSubstitutions,
  recordGoal,
  removeQueuedSubstitution,
  removeQueuedSubstitutionForOutgoing,
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

const playerGoalCount = (game: ActiveGame, playerId: string) =>
  game.history.filter(
    (event) => event.type === "goal-for" && event.playerId === playerId,
  ).length;

const preferredRoleLabel = (role: Player["preferredRoles"][number]) =>
  role === "goalkeeper"
    ? "Goalkeeper"
    : role === "defender"
      ? "Defense"
      : role === "midfielder"
        ? "Midfield"
        : "Forward";

const buildGuestPlayer = (
  teamId: TeamId,
  name: string,
  number: number | undefined,
  sequence: number,
): Player => ({
  id: `guest-${teamId}-${Date.now()}-${sequence}`,
  name,
  number,
  preferredRoles: ["defender", "midfielder", "forward", "goalkeeper"],
  active: true,
  guest: true,
});

const teamWithGameGuests = (team: Team, game: ActiveGame): Team =>
  game.guestPlayers?.length
    ? { ...team, roster: [...team.roster, ...game.guestPlayers] }
    : team;

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

function ModalBackdrop({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss: () => void;
}) {
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
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
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
    ? teamWithGameGuests(state.teams[state.activeGame.teamId], state.activeGame)
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
    <ModalBackdrop onDismiss={onClose}>
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

function GuestPlayerSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, number?: number) => void;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const trimmedName = name.trim();

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet position-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-player-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="guest-player-title">Add guest player</h2>
            <p>This player will exist only for this game.</p>
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

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmedName) return;
            onAdd(
              trimmedName,
              number ? Number.parseInt(number, 10) : undefined,
            );
          }}
        >
          <label className="field">
            <span>Player name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Guest player"
              required
            />
          </label>
          <label className="field">
            <span>
              Jersey number <small>Optional</small>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="99"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="—"
            />
          </label>
          <div className="sheet-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-action"
              type="submit"
              disabled={!trimmedName}
            >
              <CirclePlus size={18} aria-hidden="true" />
              Add guest
            </button>
          </div>
        </form>
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
  const [guestPlayers, setGuestPlayers] = useState<Player[]>([]);
  const [guestPlayerOpen, setGuestPlayerOpen] = useState(false);
  const [shortStartConfirm, setShortStartConfirm] = useState(false);
  const setupTeam = useMemo(
    () => ({ ...team, roster: [...team.roster, ...guestPlayers] }),
    [guestPlayers, team],
  );
  const activePlayers = useMemo(
    () => setupTeam.roster.filter((player) => player.active),
    [setupTeam.roster],
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
        setupTeam.roster,
      ),
    );
  };

  const selectedIds = Object.values(assignments).filter(Boolean);
  const expectedOnField = team.sideSize;
  const assignmentCount = selectedIds.length;
  const benchIds = presentIds.filter((id) => !selectedIds.includes(id));
  const attendanceShortfall = Math.max(0, team.sideSize - presentIds.length);
  const requiredAssignments = Math.min(team.sideSize, presentIds.length);
  const canStart =
    presentIds.length > 0 && assignmentCount === requiredAssignments;
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
      assignPlayersByPreference(formation, availableIds, setupTeam.roster),
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

  const addGuestPlayer = (name: string, number?: number) => {
    const guest = buildGuestPlayer(
      team.id,
      name,
      number,
      guestPlayers.length + 1,
    );
    setGuestPlayers((current) => [...current, guest]);
    setPresentIds((current) => [...current, guest.id]);
    setAssignments((current) => {
      const openPosition = formation.positions.find(
        (position) => !current[position.id],
      );
      return openPosition
        ? { ...current, [openPosition.id]: guest.id }
        : current;
    });
    setGuestPlayerOpen(false);
  };

  const removeGuestPlayer = (playerId: string) => {
    setGuestPlayers((current) =>
      current.filter((player) => player.id !== playerId),
    );
    setPresentIds((current) => current.filter((id) => id !== playerId));
    setAssignments((current) =>
      Object.fromEntries(
        Object.entries(current).map(([positionId, id]) => [
          positionId,
          id === playerId ? "" : id,
        ]),
      ),
    );
  };

  const start = () => {
    if (!canStart) return;
    const game = createGame(
      setupTeam,
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
    game.guestPlayers = guestPlayers.map((player) => ({ ...player }));
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
            <div className="inline-warning attendance-warning" role="alert">
              <div className="attendance-warning-message">
                <CircleAlert size={18} aria-hidden="true" />
                <span>
                  Short {attendanceShortfall}{" "}
                  {attendanceShortfall === 1 ? "player" : "players"}:{" "}
                  {presentIds.length} present for this {team.sideSize}v
                  {team.sideSize} game. Add a guest or prepare to play
                  short-sided.
                </span>
              </div>
              <div className="attendance-support-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setGuestPlayerOpen(true)}
                >
                  <CirclePlus size={18} aria-hidden="true" />
                  Add guest player
                </button>
                <small>Guest players are saved only with this game.</small>
              </div>
            </div>
          )}
          <div className="attendance-grid">
            {activePlayers.map((player) => {
              const present = presentIds.includes(player.id);
              const attendanceButton = (
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
                    <small>
                      {player.guest ? "Guest · " : ""}
                      {present ? "Present" : "Absent"}
                    </small>
                  </span>
                </button>
              );
              return player.guest ? (
                <div className="guest-attendance-row" key={player.id}>
                  {attendanceButton}
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => removeGuestPlayer(player.id)}
                    aria-label={`Remove guest ${player.name}`}
                    title={`Remove guest ${player.name}`}
                  >
                    <Trash2 size={19} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                attendanceButton
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
            team={setupTeam}
            onChoosePosition={setStarterPositionId}
          />
          <div className="bench-preview">
            <strong>Starting bench</strong>
            {benchIds.length ? (
              <ul className="starter-bench-list">
                {benchIds.map((id) => (
                  <li key={id}>{playerName(setupTeam, id)}</li>
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
            onClick={() =>
              attendanceShortfall > 0 ? setShortStartConfirm(true) : start()
            }
          >
            <Play size={22} aria-hidden="true" />{" "}
            {attendanceShortfall > 0 ? "Start short-sided" : "Start game"}
          </button>
        )}
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
      {guestPlayerOpen && (
        <GuestPlayerSheet
          onClose={() => setGuestPlayerOpen(false)}
          onAdd={addGuestPlayer}
        />
      )}
      {shortStartConfirm && (
        <ConfirmSheet
          title={`Start with ${assignmentCount} players?`}
          body={`This ${team.sideSize}v${team.sideSize} game will begin short-sided with ${assignmentCount} assigned players. You can return a late player or add a guest during the game.`}
          cancelLabel="Keep preparing"
          confirmLabel="Start short-sided"
          confirmClassName="primary-action"
          confirmIcon={<Play size={18} aria-hidden="true" />}
          onCancel={() => setShortStartConfirm(false)}
          onConfirm={start}
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
  const [goalSummaryOpen, setGoalSummaryOpen] = useState(false);
  const [guestPositionId, setGuestPositionId] = useState<string | null>(null);
  const [benchQueuePlayerId, setBenchQueuePlayerId] = useState<string | null>(
    null,
  );
  const [fieldQueuePlayerId, setFieldQueuePlayerId] = useState<string | null>(
    null,
  );
  const [fieldActions, setFieldActions] = useState<{
    playerId: string;
    includeQueue: boolean;
  } | null>(null);
  const [rosterView, setRosterView] = useState<"field" | "bench">("bench");
  const rosterSwipeStart = useRef<{ x: number; y: number } | null>(null);
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
  const goalkeeperPositionId = formation.positions.find(
    (position) => position.role === "goalkeeper",
  )?.id;
  const scorerIds = fieldIds.filter(
    (playerId) => game.assignments[goalkeeperPositionId ?? ""] !== playerId,
  );
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
  const goalScorers = summarizePlayerPositions(game).filter(
    (summary) => summary.goals.length > 0,
  );
  const validationErrors = validateGame(game, team.sideSize);
  const queuedPairs = game.queuedSubstitutions ?? [];
  const queuedPlanErrors = validateSubstitutionPairs(game, queuedPairs);
  const compactHeaderInteractive = headerCollapseProgress > 0.8;
  const periodBreak = displayed.periodBreak;
  const clockActionLabel = game.clock.running
    ? "Pause"
    : periodBreak && !periodBreak.final
      ? `Start ${period.label} ${periodBreak.completedPeriod + 1}`
      : periodBreak?.final
        ? "Continue clock"
        : "Start clock";

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

  const moveRosterTabFocus = (view: "field" | "bench") => {
    setRosterView(view);
    window.requestAnimationFrame(() =>
      document.getElementById(`roster-${view}-tab`)?.focus(),
    );
  };

  const finishRosterSwipe = (x: number, y: number) => {
    const start = rosterSwipeStart.current;
    rosterSwipeStart.current = null;
    if (!start) return;
    const deltaX = x - start.x;
    const deltaY = y - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }
    setRosterView(deltaX < 0 ? "field" : "bench");
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
              <button
                className="scoreboard-team score-team-button"
                type="button"
                aria-label={`Our score: ${score.us}. View scorers`}
                onClick={() => setGoalSummaryOpen(true)}
              >
                <small>Us</small>
                <strong>{score.us}</strong>
              </button>
              <span
                className="scoreboard-team score-divider"
                aria-hidden="true"
              >
                <small />
                <strong>–</strong>
              </span>
              <span className="scoreboard-team opponent-score">
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
          <button
            className="compact-score-button"
            type="button"
            tabIndex={compactHeaderInteractive ? 0 : -1}
            aria-label={`Our score: ${score.us}. View scorers`}
            onClick={() => setGoalSummaryOpen(true)}
          >
            {score.us}
          </button>
          <span aria-hidden="true">–</span>
          <span
            className="compact-opponent-score"
            aria-label={`Opponent score: ${score.opponent}`}
          >
            {score.opponent}
          </span>
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
            {!periodBreak.final && queuedPairs.length > 0 && (
              <small className="period-break-queue-status">
                {queuedPairs.length} substitution
                {queuedPairs.length === 1 ? "" : "s"} queued
              </small>
            )}
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
                  {queuedPlanErrors.length ? "Review plan" : "Review & execute"}
                </button>
              ) : game.benchIds.length > 0 ? (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => setPlannerOpen(true)}
                >
                  <ArrowRightLeft size={18} aria-hidden="true" />
                  Plan subs
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
      {queuedPairs.length > 0 && !periodBreak && (
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
            <span>
              <h1>On the field</h1>
              <small className="section-hint">
                Tap a player for actions, or drag them onto another position.
              </small>
            </span>
            <span>
              {fieldIds.length}/
              {Math.min(
                team.sideSize,
                game.presentIds.filter(
                  (playerId) => !game.unavailableIds.includes(playerId),
                ).length,
              )}
            </span>
          </div>
          <Pitch
            formation={formation}
            assignments={game.assignments}
            team={team}
            totals={displayed.totals}
            onEditPlayer={(playerId) =>
              setFieldActions({ playerId, includeQueue: true })
            }
            onAddGuestAtPosition={setGuestPositionId}
            onMovePlayer={(playerId, positionId) =>
              safeChange(() =>
                movePlayer(game, playerId, positionId, Date.now()),
              )
            }
          />
        </section>

        <aside className="bench-section">
          <div
            className="roster-tabs"
            role="tablist"
            aria-label="Player status"
            onKeyDown={(event) => {
              let nextView: "field" | "bench" | null = null;
              if (event.key === "ArrowRight") {
                nextView = rosterView === "bench" ? "field" : "bench";
              } else if (event.key === "ArrowLeft") {
                nextView = rosterView === "field" ? "bench" : "field";
              } else if (event.key === "Home") {
                nextView = "bench";
              } else if (event.key === "End") {
                nextView = "field";
              }
              if (nextView) {
                event.preventDefault();
                moveRosterTabFocus(nextView);
              }
            }}
          >
            <button
              id="roster-bench-tab"
              type="button"
              role="tab"
              aria-selected={rosterView === "bench"}
              aria-controls="roster-status-panel"
              tabIndex={rosterView === "bench" ? 0 : -1}
              onClick={() => setRosterView("bench")}
            >
              Bench <span>{game.benchIds.length}</span>
            </button>
            <button
              id="roster-field-tab"
              type="button"
              role="tab"
              aria-selected={rosterView === "field"}
              aria-controls="roster-status-panel"
              tabIndex={rosterView === "field" ? 0 : -1}
              onClick={() => setRosterView("field")}
            >
              On field <span>{fieldIds.length}</span>
            </button>
          </div>

          <div
            id="roster-status-panel"
            className="roster-tab-panel"
            role="tabpanel"
            aria-labelledby={`roster-${rosterView}-tab`}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              rosterSwipeStart.current = touch
                ? { x: touch.clientX, y: touch.clientY }
                : null;
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              if (touch) finishRosterSwipe(touch.clientX, touch.clientY);
            }}
            onTouchCancel={() => {
              rosterSwipeStart.current = null;
            }}
          >
            {rosterView === "field" ? (
              fieldIds.length ? (
                <div className="bench-list field-player-list">
                  {formation.positions.map((position) => {
                    const id = game.assignments[position.id];
                    if (!id) return null;
                    const queuedPair = queuedPairs.find(
                      (pair) => pair.outPlayerId === id,
                    );
                    const queuedIncoming = queuedPair
                      ? playerName(team, queuedPair.inPlayerId)
                      : undefined;
                    return (
                      <FieldPlayerTimeRow
                        key={id}
                        player={team.roster.find((player) => player.id === id)!}
                        goalCount={playerGoalCount(displayed, id)}
                        positionLabel={position.label}
                        currentFieldTime={getCurrentFieldSeconds(displayed, id)}
                        aggregateFieldTime={
                          displayed.totals[id]?.fieldSeconds ?? 0
                        }
                        queuedIncomingName={queuedIncoming}
                        canQueue={game.benchIds.length > 0}
                        onQueue={() => setFieldQueuePlayerId(id)}
                        onMore={() =>
                          setFieldActions({
                            playerId: id,
                            includeQueue: false,
                          })
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="bench-empty">
                  <strong>No players on the field</strong>
                  <span>Assign a guest or add a player to the game.</span>
                </div>
              )
            ) : game.benchIds.length ? (
              <div className="bench-list">
                {game.benchIds.map((id) => {
                  const queuedPair = queuedPairs.find(
                    (pair) => pair.inPlayerId === id,
                  );
                  const queuedPosition = formation.positions.find(
                    (position) => position.id === queuedPair?.positionId,
                  );
                  const playedSeconds = displayed.totals[id]?.fieldSeconds ?? 0;
                  const belowMinimumPace =
                    displayed.clock.elapsedSeconds >=
                      game.durationSeconds * 0.25 &&
                    playedSeconds / displayed.clock.elapsedSeconds < 0.5;
                  return (
                    <PlayerTimeRow
                      key={id}
                      player={team.roster.find((player) => player.id === id)!}
                      goalCount={playerGoalCount(displayed, id)}
                      currentBenchTime={getCurrentBenchSeconds(displayed, id)}
                      playedTime={playedSeconds}
                      aggregateBenchTime={
                        displayed.totals[id]?.benchSeconds ?? 0
                      }
                      belowMinimumPace={belowMinimumPace}
                      queuedPositionLabel={queuedPosition?.shortLabel}
                      onQueue={() => setBenchQueuePlayerId(id)}
                      onUnavailable={() => handleUnavailable(id)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="bench-empty">
                <strong>No available substitutes</strong>
                <span>Position changes are still available.</span>
              </div>
            )}
          </div>

          <details className="availability-section">
            <summary className="disclosure-summary">
              <span>
                <strong>Out of game</strong>
                <small>Not currently available to play</small>
              </span>
              <span>
                {game.unavailableIds.length}{" "}
                {game.unavailableIds.length === 1 ? "player" : "players"}
              </span>
            </summary>
            <div className="availability-content">
              {game.unavailableIds.length ? (
                <div className="unavailable-list">
                  {game.unavailableIds.map((id) => (
                    <div className="unavailable-row" key={id}>
                      <span>
                        <GoalMarkedPlayerName
                          label={playerName(team, id)}
                          goalCount={playerGoalCount(displayed, id)}
                        />
                        <small>Not playing</small>
                      </span>
                      <button
                        className="secondary-action"
                        type="button"
                        aria-label={`Add ${playerName(team, id)} to game`}
                        onClick={() => handleAvailable(id)}
                      >
                        Add to game
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No players are currently out of the game.</p>
              )}
            </div>
          </details>
        </aside>
      </div>

      <GameLog game={game} formation={formation} team={team} />

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
          {clockActionLabel}
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
          {queuedPairs.length ? "Review subs" : "Plan subs"}
        </button>
        <button
          className="undo-button"
          type="button"
          disabled={game.history.length === 0}
          onClick={() => safeChange(() => undoLastEvent(game))}
          aria-label="Undo last change"
        >
          <RotateCcw size={21} aria-hidden="true" />
          Undo
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
          game={displayed}
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
          playerIds={scorerIds}
          team={team}
          game={displayed}
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
      {goalSummaryOpen && (
        <GoalSummarySheet
          scorers={goalScorers}
          team={team}
          score={score.us}
          onClose={() => setGoalSummaryOpen(false)}
        />
      )}
      {guestPositionId && (
        <GuestPlayerSheet
          onClose={() => setGuestPositionId(null)}
          onAdd={(name, number) => {
            const guest = buildGuestPlayer(
              team.id,
              name,
              number,
              (game.guestPlayers?.length ?? 0) + 1,
            );
            if (
              safeChange(() =>
                addGuestPlayer(
                  game,
                  guest,
                  guestPositionId,
                  team.sideSize,
                  Date.now(),
                ),
              )
            ) {
              setGuestPositionId(null);
            }
          }}
        />
      )}
      {benchQueuePlayerId && (
        <BenchSubstitutionPicker
          playerId={benchQueuePlayerId}
          game={displayed}
          team={team}
          onClose={() => setBenchQueuePlayerId(null)}
          onSelect={(outPlayerId) => {
            if (
              safeChange(() =>
                queueBenchSubstitution(game, benchQueuePlayerId, outPlayerId),
              )
            ) {
              setBenchQueuePlayerId(null);
            }
          }}
          onRemove={() => {
            if (
              safeChange(() =>
                removeQueuedSubstitution(game, benchQueuePlayerId),
              )
            ) {
              setBenchQueuePlayerId(null);
            }
          }}
        />
      )}
      {fieldQueuePlayerId && (
        <FieldSubstitutionPicker
          playerId={fieldQueuePlayerId}
          game={displayed}
          team={team}
          onClose={() => setFieldQueuePlayerId(null)}
          onSelect={(inPlayerId) => {
            if (
              safeChange(() =>
                queueBenchSubstitution(game, inPlayerId, fieldQueuePlayerId),
              )
            ) {
              setFieldQueuePlayerId(null);
            }
          }}
          onRemove={() => {
            if (
              safeChange(() =>
                removeQueuedSubstitutionForOutgoing(game, fieldQueuePlayerId),
              )
            ) {
              setFieldQueuePlayerId(null);
            }
          }}
        />
      )}
      {fieldActions && (
        <FieldPlayerActionsSheet
          playerId={fieldActions.playerId}
          game={displayed}
          team={team}
          includeQueue={fieldActions.includeQueue}
          onClose={() => setFieldActions(null)}
          onQueue={() => {
            setFieldQueuePlayerId(fieldActions.playerId);
            setFieldActions(null);
          }}
          onChangePosition={() => {
            setPositionEditorPlayerId(fieldActions.playerId);
            setFieldActions(null);
          }}
          onUnavailable={() => {
            if (handleUnavailable(fieldActions.playerId)) {
              setFieldActions(null);
            }
          }}
        />
      )}
      {confirmedPairs && (
        <SubstitutionSummary
          pairs={confirmedPairs}
          formation={formation}
          team={team}
          game={displayed}
          onClose={() => setConfirmedPairs(null)}
        />
      )}
      {confirmedEntry && (
        <PlayerEntrySummary
          entry={confirmedEntry}
          formation={formation}
          team={team}
          game={displayed}
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
  onAddGuestAtPosition,
  onMovePlayer,
}: {
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  team: Team;
  totals: ActiveGame["totals"];
  onEditPlayer: (playerId: string) => void;
  onAddGuestAtPosition: (positionId: string) => void;
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
      <span className="pitch-direction attack" aria-hidden="true">
        Attack
      </span>
      <span className="pitch-direction defend" aria-hidden="true">
        Defend
      </span>
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
            aria-label={`Open actions for ${player.name}`}
            title="Tap for actions or drag to another position"
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
          <button
            type="button"
            className="pitch-player empty"
            key={position.id}
            style={style}
            data-position-id={position.id}
            onClick={() => onAddGuestAtPosition(position.id)}
            aria-label={`Add guest player at ${position.label}`}
            title={`Add guest player at ${position.label}`}
          >
            {content}
          </button>
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
      <span className="pitch-direction attack" aria-hidden="true">
        Attack
      </span>
      <span className="pitch-direction defend" aria-hidden="true">
        Defend
      </span>
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
    <ModalBackdrop onDismiss={onClose}>
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
  game,
  score,
  onClose,
  onSelect,
  onOpponentGoal,
}: {
  playerIds: string[];
  team: Team;
  game: ActiveGame;
  score: { us: number; opponent: number };
  onClose: () => void;
  onSelect: (playerId: string) => void;
  onOpponentGoal: () => void;
}) {
  return (
    <ModalBackdrop onDismiss={onClose}>
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
              <GoalMarkedPlayerName
                label={playerLabel(team, playerId)}
                goalCount={playerGoalCount(game, playerId)}
                emphasized={false}
              />
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

function GoalSummarySheet({
  scorers,
  team,
  score,
  onClose,
}: {
  scorers: ReturnType<typeof summarizePlayerPositions>;
  team: Team;
  score: number;
  onClose: () => void;
}) {
  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet goal-summary-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-summary-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="goal-summary-title">Our goals</h2>
            <p>
              {team.name} · {score} {score === 1 ? "goal" : "goals"}
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

        {scorers.length ? (
          <ul className="goal-summary-list">
            {scorers.map((scorer) => (
              <li key={scorer.playerId}>
                <GoalMarkedPlayerName
                  label={playerName(team, scorer.playerId)}
                  goalCount={scorer.goals.length}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">No goals recorded yet.</p>
        )}
      </section>
    </ModalBackdrop>
  );
}

function BenchSubstitutionPicker({
  playerId,
  game,
  team,
  onClose,
  onSelect,
  onRemove,
}: {
  playerId: string;
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onSelect: (outPlayerId: string) => void;
  onRemove: () => void;
}) {
  const player = team.roster.find((item) => item.id === playerId);
  if (!player) return null;
  const formation = getFormation(game.formationId);
  const currentPair = game.queuedSubstitutions?.find(
    (pair) => pair.inPlayerId === playerId,
  );
  const choices = Object.entries(game.assignments)
    .map(([positionId, outPlayerId], formationIndex) => {
      const position = formation.positions.find(
        (item) => item.id === positionId,
      )!;
      const preferenceIndex = player.preferredRoles.indexOf(position.role);
      return {
        position,
        outPlayerId,
        formationIndex,
        preferenceIndex:
          preferenceIndex === -1 ? Number.POSITIVE_INFINITY : preferenceIndex,
      };
    })
    .sort(
      (a, b) =>
        a.preferenceIndex - b.preferenceIndex ||
        a.formationIndex - b.formationIndex,
    );

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet bench-substitution-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bench-substitution-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="bench-substitution-title">
              Queue{" "}
              <GoalMarkedPlayerName
                label={playerLabel(team, playerId)}
                goalCount={playerGoalCount(game, playerId)}
                emphasized={false}
              />
            </h2>
            <p>Choose the player they will replace.</p>
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

        <div className="bench-player-preferences">
          <small>Player status</small>
          <strong>
            {formatDuration(game.totals[playerId]?.fieldSeconds ?? 0)} played ·{" "}
            {formatDuration(getCurrentBenchSeconds(game, playerId))} current
            bench
          </strong>
          <small>Preferred roles</small>
          <strong>
            {player.preferredRoles.map(preferredRoleLabel).join(" · ")}
          </strong>
        </div>

        <div className="bench-replacement-list">
          {choices.map(({ position, outPlayerId, preferenceIndex }) => (
            <button
              className={
                currentPair?.outPlayerId === outPlayerId ? "selected" : ""
              }
              type="button"
              key={outPlayerId}
              aria-pressed={currentPair?.outPlayerId === outPlayerId}
              onClick={() => onSelect(outPlayerId)}
            >
              <span>
                <GoalMarkedPlayerName
                  label={playerLabel(team, outPlayerId)}
                  goalCount={playerGoalCount(game, outPlayerId)}
                />
                <small>{position.label}</small>
              </span>
              <span className="replacement-fit">
                {Number.isFinite(preferenceIndex)
                  ? `${preferenceIndex + 1}${preferenceIndex === 0 ? "st" : preferenceIndex === 1 ? "nd" : "rd"} preference`
                  : "Other role"}
              </span>
            </button>
          ))}
        </div>

        {currentPair && (
          <div className="bench-picker-actions">
            <button
              className="secondary-action remove-from-plan-action"
              type="button"
              onClick={onRemove}
            >
              <Trash2 size={18} aria-hidden="true" />
              Remove from queue
            </button>
          </div>
        )}
      </section>
    </ModalBackdrop>
  );
}

function FieldSubstitutionPicker({
  playerId,
  game,
  team,
  onClose,
  onSelect,
  onRemove,
}: {
  playerId: string;
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onSelect: (inPlayerId: string) => void;
  onRemove: () => void;
}) {
  const player = team.roster.find((item) => item.id === playerId);
  if (!player) return null;
  const formation = getFormation(game.formationId);
  const positionEntry = Object.entries(game.assignments).find(
    ([, assignedPlayerId]) => assignedPlayerId === playerId,
  );
  if (!positionEntry) return null;
  const position = formation.positions.find(
    (item) => item.id === positionEntry[0],
  )!;
  const currentPair = game.queuedSubstitutions?.find(
    (pair) => pair.outPlayerId === playerId,
  );
  const choices = game.benchIds
    .map((inPlayerId) => {
      const incoming = team.roster.find((item) => item.id === inPlayerId)!;
      const preferenceIndex = incoming.preferredRoles.indexOf(position.role);
      return {
        player: incoming,
        preferenceIndex:
          preferenceIndex === -1 ? Number.POSITIVE_INFINITY : preferenceIndex,
      };
    })
    .sort(
      (a, b) =>
        (game.totals[a.player.id]?.fieldSeconds ?? 0) -
          (game.totals[b.player.id]?.fieldSeconds ?? 0) ||
        a.preferenceIndex - b.preferenceIndex ||
        a.player.name.localeCompare(b.player.name),
    );

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet bench-substitution-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-substitution-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="field-substitution-title">
              Queue{" "}
              <GoalMarkedPlayerName
                label={playerLabel(team, playerId)}
                goalCount={playerGoalCount(game, playerId)}
                emphasized={false}
              />{" "}
              out
            </h2>
            <p>Choose who will enter at {position.label}.</p>
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

        <div className="bench-player-preferences">
          <small>Player status</small>
          <strong>
            {formatDuration(game.totals[playerId]?.fieldSeconds ?? 0)} played ·{" "}
            {formatDuration(getCurrentFieldSeconds(game, playerId))} playing now
          </strong>
          <small>Current position</small>
          <strong>{position.label}</strong>
        </div>

        <div className="bench-replacement-list">
          {choices.map(({ player: incoming, preferenceIndex }) => (
            <button
              className={
                currentPair?.inPlayerId === incoming.id ? "selected" : ""
              }
              type="button"
              key={incoming.id}
              aria-pressed={currentPair?.inPlayerId === incoming.id}
              onClick={() => onSelect(incoming.id)}
            >
              <span>
                <GoalMarkedPlayerName
                  label={playerLabel(team, incoming.id)}
                  goalCount={playerGoalCount(game, incoming.id)}
                />
                <small>
                  {formatDuration(game.totals[incoming.id]?.fieldSeconds ?? 0)}{" "}
                  played ·{" "}
                  {formatDuration(getCurrentBenchSeconds(game, incoming.id))}{" "}
                  sitting
                </small>
              </span>
              <span className="replacement-fit">
                {Number.isFinite(preferenceIndex)
                  ? `${preferenceIndex + 1}${preferenceIndex === 0 ? "st" : preferenceIndex === 1 ? "nd" : "rd"} preference`
                  : "Other role"}
              </span>
            </button>
          ))}
        </div>

        {currentPair && (
          <div className="bench-picker-actions">
            <button
              className="secondary-action remove-from-plan-action"
              type="button"
              onClick={onRemove}
            >
              <Trash2 size={18} aria-hidden="true" />
              Remove from queue
            </button>
          </div>
        )}
      </section>
    </ModalBackdrop>
  );
}

function FieldPlayerActionsSheet({
  playerId,
  game,
  team,
  includeQueue,
  onClose,
  onQueue,
  onChangePosition,
  onUnavailable,
}: {
  playerId: string;
  game: ActiveGame;
  team: Team;
  includeQueue: boolean;
  onClose: () => void;
  onQueue: () => void;
  onChangePosition: () => void;
  onUnavailable: () => void;
}) {
  const label = playerName(team, playerId);
  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet field-player-actions-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-player-actions-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="field-player-actions-title">
              <GoalMarkedPlayerName
                label={label}
                goalCount={playerGoalCount(game, playerId)}
                emphasized={false}
              />
            </h2>
            <p>Choose another on-field action.</p>
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
        <div className="field-player-action-list">
          {includeQueue && (
            <button
              className="secondary-action queue-field-player-action"
              type="button"
              onClick={onQueue}
            >
              <ArrowRightLeft size={20} aria-hidden="true" />
              Queue substitution
            </button>
          )}
          <button
            className="secondary-action"
            type="button"
            onClick={onChangePosition}
          >
            <Move size={20} aria-hidden="true" />
            Change positions
          </button>
          <button
            className="secondary-action remove-field-player-action"
            type="button"
            onClick={onUnavailable}
          >
            <UserRoundX size={20} aria-hidden="true" />
            Take {label} out of game
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

function FieldPlayerTimeRow({
  player,
  goalCount,
  positionLabel,
  currentFieldTime,
  aggregateFieldTime,
  queuedIncomingName,
  canQueue,
  onQueue,
  onMore,
}: {
  player: Player;
  goalCount: number;
  positionLabel: string;
  currentFieldTime: number;
  aggregateFieldTime: number;
  queuedIncomingName?: string;
  canQueue: boolean;
  onQueue: () => void;
  onMore: () => void;
}) {
  const queued = Boolean(queuedIncomingName);
  const hasEarlierFieldTime = aggregateFieldTime > currentFieldTime;
  return (
    <div className={`player-time-row ${queued ? "queued" : ""}`}>
      <span className="player-number">{player.number ?? "–"}</span>
      <span className="player-time-name">
        <GoalMarkedPlayerName label={player.name} goalCount={goalCount} />
        <small>{positionLabel}</small>
        {queued ? (
          <span className="bench-queue-status">
            <Check size={12} aria-hidden="true" />
            Queued out for {queuedIncomingName}
          </span>
        ) : (
          hasEarlierFieldTime && (
            <span className="bench-total-status">
              {formatDuration(aggregateFieldTime)} total played
            </span>
          )
        )}
      </span>
      <span className="primary-time">
        <small>Playing</small>
        <strong>{formatDuration(currentFieldTime)}</strong>
      </span>
      <span className="player-row-actions">
        <button
          className={`icon-button queue-player-button ${
            queued ? "queued" : ""
          }`}
          type="button"
          disabled={!queued && !canQueue}
          onClick={onQueue}
          aria-label={`${queued ? "Edit queued substitution for" : "Queue"} ${player.name} out`}
          title={`${queued ? "Edit queued substitution for" : "Queue"} ${player.name} out`}
        >
          {queued ? (
            <Pencil size={19} aria-hidden="true" />
          ) : (
            <ArrowRightLeft size={20} aria-hidden="true" />
          )}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onMore}
          aria-label={`More actions for ${player.name}`}
          title={`More actions for ${player.name}`}
        >
          <MoreHorizontal size={21} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

function PlayerTimeRow({
  player,
  goalCount,
  currentBenchTime,
  playedTime,
  aggregateBenchTime,
  belowMinimumPace,
  queuedPositionLabel,
  onQueue,
  onUnavailable,
}: {
  player: Player;
  goalCount: number;
  currentBenchTime: number;
  playedTime: number;
  aggregateBenchTime: number;
  belowMinimumPace: boolean;
  queuedPositionLabel?: string;
  onQueue: () => void;
  onUnavailable: () => void;
}) {
  const queued = Boolean(queuedPositionLabel);
  const hasEarlierBenchTime = aggregateBenchTime > currentBenchTime;
  return (
    <div className={`player-time-row ${queued ? "queued" : ""}`}>
      <span className="player-number">{player.number ?? "–"}</span>
      <span className="player-time-name">
        <GoalMarkedPlayerName label={player.name} goalCount={goalCount} />
        <small>
          {playedTime > 0
            ? `${formatDuration(playedTime)} played`
            : "Waiting to enter"}
        </small>
        {queued ? (
          <span className="bench-queue-status">
            <Check size={12} aria-hidden="true" />
            Queued for {queuedPositionLabel}
          </span>
        ) : belowMinimumPace ? (
          <span className="minimum-play-warning">
            <CircleAlert size={13} aria-hidden="true" />
            Below 50% pace
          </span>
        ) : (
          hasEarlierBenchTime && (
            <span className="bench-total-status">
              {formatDuration(aggregateBenchTime)} total bench
            </span>
          )
        )}
      </span>
      <span className="primary-time">
        <small>Sitting</small>
        <strong>{formatDuration(currentBenchTime)}</strong>
      </span>
      <span className="player-row-actions">
        <button
          className={`icon-button queue-player-button ${
            queued ? "queued" : ""
          }`}
          type="button"
          onClick={onQueue}
          aria-label={`${queued ? "Edit queued substitution for" : "Queue"} ${player.name}`}
          title={`${queued ? "Edit queued substitution for" : "Queue"} ${player.name}`}
        >
          {queued ? (
            <Pencil size={19} aria-hidden="true" />
          ) : (
            <ArrowRightLeft size={20} aria-hidden="true" />
          )}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={onUnavailable}
          aria-label={`Take ${player.name} out of game`}
          title={`Take ${player.name} out of game`}
        >
          <UserRoundX size={20} aria-hidden="true" />
        </button>
      </span>
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
  const recommendedCount = getRecommendedSubstitutionCount(game, team);
  const initialCount = initialPairs?.length ?? recommendedCount;
  const [count, setCount] = useState(initialCount);
  const [pairs, setPairs] = useState<SubstitutionPair[]>(
    () =>
      initialPairs?.map((pair) => ({ ...pair })) ??
      suggestSubstitutions(game, recommendedCount, team),
  );
  const [hasCoachSelections, setHasCoachSelections] = useState(
    Boolean(initialPairs?.length),
  );
  const formation = getFormation(game.formationId);

  const changeCount = (nextCount: number) => {
    setCount(nextCount);
    if (!hasCoachSelections) {
      setPairs(suggestSubstitutions(game, nextCount, team));
      return;
    }
    setPairs((current) => {
      if (nextCount <= current.length) {
        return current.slice(0, nextCount);
      }

      const selectedOutIds = new Set(current.map((pair) => pair.outPlayerId));
      const selectedInIds = new Set(current.map((pair) => pair.inPlayerId));
      const remainingGame = {
        ...game,
        assignments: Object.fromEntries(
          Object.entries(game.assignments).filter(
            ([, playerId]) => !selectedOutIds.has(playerId),
          ),
        ),
        benchIds: game.benchIds.filter(
          (playerId) => !selectedInIds.has(playerId),
        ),
      };
      const additionalPairs = suggestSubstitutions(
        remainingGame,
        nextCount - current.length,
        team,
      );

      return [...current, ...additionalPairs];
    });
  };
  const updatePair = (index: number, patch: Partial<SubstitutionPair>) => {
    setHasCoachSelections(true);
    setPairs((current) =>
      current.map((pair, pairIndex) =>
        pairIndex === index ? { ...pair, ...patch } : pair,
      ),
    );
  };
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
    <ModalBackdrop onDismiss={onClose}>
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
                      {formatDuration(game.totals[id]?.fieldSeconds ?? 0)}{" "}
                      played
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
              <GoalMarkedPlayerName
                label={playerName(team, pair.outPlayerId)}
                goalCount={playerGoalCount(game, pair.outPlayerId)}
              />
              <ArrowRightLeft
                className="review-direction"
                size={17}
                aria-hidden="true"
              />
              <span className="in-label">IN</span>
              <GoalMarkedPlayerName
                label={playerName(team, pair.inPlayerId)}
                goalCount={playerGoalCount(game, pair.inPlayerId)}
              />
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
  game,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
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
              <GoalMarkedPlayerName
                label={playerLabel(team, pair.outPlayerId)}
                goalCount={playerGoalCount(game, pair.outPlayerId)}
              />
            </span>
            <span className="ready-direction">
              <ArrowRightLeft size={24} aria-hidden="true" />
              <small>{position?.shortLabel}</small>
            </span>
            <span className="ready-player in">
              <small>IN</small>
              <GoalMarkedPlayerName
                label={playerLabel(team, pair.inPlayerId)}
                goalCount={playerGoalCount(game, pair.inPlayerId)}
              />
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
  game,
  errors,
  onClose,
  onEdit,
  onCancel,
  onExecute,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  errors: string[];
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onExecute: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (deleteConfirm) {
    return (
      <ConfirmSheet
        title="Delete queued plan?"
        body="This removes every queued swap. Players and playing time will not change."
        cancelLabel="Keep plan"
        confirmLabel="Delete plan"
        confirmIcon={<Trash2 size={18} aria-hidden="true" />}
        onCancel={() => setDeleteConfirm(false)}
        onConfirm={onCancel}
      />
    );
  }

  return (
    <ModalBackdrop onDismiss={onClose}>
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

        <ReadySwapList
          pairs={pairs}
          formation={formation}
          team={team}
          game={game}
        />

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
            className="danger-action delete-plan-action"
            type="button"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 size={18} aria-hidden="true" />
            Delete plan
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
  game,
  onClose,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  onClose: () => void;
}) {
  return (
    <ModalBackdrop onDismiss={onClose}>
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

        <ReadySwapList
          pairs={pairs}
          formation={formation}
          team={team}
          game={game}
        />

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
  game,
  onClose,
}: {
  entry: { playerId: string; positionId: string };
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  onClose: () => void;
}) {
  const position = formation.positions.find(
    (item) => item.id === entry.positionId,
  );

  return (
    <ModalBackdrop onDismiss={onClose}>
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
            <GoalMarkedPlayerName
              label={playerLabel(team, entry.playerId)}
              goalCount={playerGoalCount(game, entry.playerId)}
            />
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
  const summaries = summarizePlayerPositions(game).sort(
    (a, b) =>
      Number(b.goals.length > 0) - Number(a.goals.length > 0) ||
      b.totalSeconds - a.totalSeconds ||
      playerName(team, a.playerId).localeCompare(playerName(team, b.playerId)),
  );

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

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
            const playerDisplayName = player?.name ?? "Unknown player";
            return (
              <li key={summary.playerId}>
                <div className="player-summary-heading">
                  <span className="player-summary-name">
                    <GoalMarkedPlayerName
                      label={playerDisplayName}
                      goalCount={summary.goals.length}
                    />
                  </span>
                  <span className="player-summary-total">
                    {formatDuration(summary.totalSeconds)} total
                  </span>
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

function GoalMarkedPlayerName({
  label,
  goalCount,
  emphasized = true,
}: {
  label: string;
  goalCount: number;
  emphasized?: boolean;
}) {
  return (
    <span className="player-name-with-goals">
      {emphasized ? <strong>{label}</strong> : <span>{label}</span>}
      {goalCount > 0 && (
        <span
          className="player-goal-total"
          aria-label={`${label} scored ${goalCount} ${
            goalCount === 1 ? "goal" : "goals"
          }`}
        >
          {Array.from({ length: goalCount }, (_, index) => (
            <SoccerBallIcon key={index} />
          ))}
        </span>
      )}
    </span>
  );
}

function SoccerBallIcon() {
  return (
    <svg className="soccer-ball-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z" fill="currentColor" />
      <path
        d="M9 9.2 5.4 9.1m4.7 3.6-2.3 3m6.1-3 2.3 3M15 9.2l3.6-.1M7.8 15.7 7 19m9.2-3.3.8 3"
        fill="none"
      />
    </svg>
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
      <summary className="disclosure-summary">
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
              const goalPositionId =
                event.type === "goal-for" && event.playerId
                  ? Object.entries(event.beforeAssignments).find(
                      ([, playerId]) => playerId === event.playerId,
                    )?.[0]
                  : undefined;
              const goalPosition = goalPositionId
                ? formation.positions.find(
                    (position) => position.id === goalPositionId,
                  )
                : undefined;
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
                          ? `${eventPlayer ?? "Player"} added to game`
                          : `${eventPlayer ?? "Player"} out of game`;
              const eventDetail =
                event.type === "goal-for"
                  ? `Goal for ${team.name}${
                      goalPosition ? ` · ${goalPosition.label}` : ""
                    }`
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
}: {
  game: ActiveGame;
  team: Team;
  initialPlayerId: string;
  onClose: () => void;
  onConfirm: (playerId: string, positionId: string) => void;
}) {
  const formation = getFormation(game.formationId);
  const playerId = Object.values(game.assignments).includes(initialPlayerId)
    ? initialPlayerId
    : Object.values(game.assignments)[0];
  const currentPosition = formation.positions.find(
    (position) => game.assignments[position.id] === playerId,
  );
  const targetPositions = formation.positions.filter(
    (position) => game.assignments[position.id] !== playerId,
  );
  const [positionId, setPositionId] = useState(targetPositions[0]?.id ?? "");

  return (
    <ModalBackdrop onDismiss={onClose}>
      <section
        className="bottom-sheet compact-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-title"
      >
        <header className="sheet-header">
          <div>
            <h2 id="position-title">Change positions</h2>
            <p>
              Position changes do not count as substitutions. You can also drag
              players directly on the field.
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
        <div className="position-player-summary">
          <span>
            <small>Player</small>
            <GoalMarkedPlayerName
              label={playerName(team, playerId)}
              goalCount={playerGoalCount(game, playerId)}
            />
          </span>
          <span>
            <small>Current position</small>
            <strong>{currentPosition?.label ?? "Open"}</strong>
          </span>
        </div>
        <div className="bench-replacement-list position-swap-list">
          {targetPositions.map((position) => {
            const occupant = game.assignments[position.id];
            const label = occupant ? playerName(team, occupant) : "Open";
            return (
              <button
                className={positionId === position.id ? "selected" : ""}
                type="button"
                key={position.id}
                aria-label={`${label} (${position.label})`}
                aria-pressed={positionId === position.id}
                onClick={() => setPositionId(position.id)}
              >
                <span>
                  {occupant ? (
                    <GoalMarkedPlayerName
                      label={label}
                      goalCount={playerGoalCount(game, occupant)}
                    />
                  ) : (
                    <strong>Open</strong>
                  )}
                  <small>{position.label}</small>
                </span>
                <span className="replacement-fit">
                  {occupant ? "Swap" : "Move"}
                </span>
              </button>
            );
          })}
        </div>
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
  cancelLabel = "Keep game",
  confirmLabel,
  confirmIcon = <Square size={18} aria-hidden="true" />,
  confirmClassName = "danger-action",
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  confirmClassName?: "primary-action" | "danger-action";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalBackdrop onDismiss={onCancel}>
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
            {cancelLabel}
          </button>
          <button
            className={confirmClassName}
            type="button"
            onClick={onConfirm}
          >
            {confirmIcon} {confirmLabel}
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
