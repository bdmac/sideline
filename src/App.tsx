import {
  ActionList,
  ActionMenu,
  Banner,
  Button,
  Dialog,
  IconButton,
  Label,
  ToggleSwitch,
  type DialogWidth,
} from "@primer/react";
import { Card } from "@primer/react/experimental";
import { ThemeProvider } from "@primer/react/next";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CirclePlus,
  Clock3,
  Download,
  FastForward,
  Flag,
  GripVertical,
  Move,
  MoveHorizontal,
  Moon,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShieldCheck,
  Square,
  Sun,
  SunMedium,
  Trash2,
  UsersRound,
  UserRoundX,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Fragment,
  type ElementType,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  COACHES,
  type Coach,
  type CoachId,
  getCoach,
  loadCoachId,
  saveCoachId,
} from "./coaches";
import {
  addGuestPlayer,
  addGuestPlayerToBench,
  applyImmediateSubstitution,
  applySubstitutions,
  assignPlayerToPosition,
  assignStartingPlayersByPreference,
  fillStartingLineup,
  updateActiveGame,
  cancelQueuedSubstitutions,
  comparePlayersByNameThenNumber,
  compareSubstitutionDestinations,
  createGame,
  endCurrentPeriod,
  fastForwardGame,
  finalizeGame,
  formatDuration,
  getCurrentBenchSeconds,
  getCurrentFieldSeconds,
  getFormation,
  getFormationsForTeam,
  getGoalkeeperChangeStatus,
  getGoalkeeperPreparationWarning,
  getMatchClockSeconds,
  getMaxSubstitutionCount,
  getNextSubstitutionSeconds,
  getPeriodStatus,
  getPlayingTimePaceWarning,
  getRecommendedSubstitutionCount,
  getRoutineRotationStatus,
  getScore,
  getSubstitutionPlanningSnapshot,
  getSubstitutionReminderStatus,
  getSubstitutionTimeBandSize,
  isImmediateSubstitution,
  markAvailable,
  markUnavailable,
  materializeGame,
  movePlayer,
  previewBenchSubstitution,
  queueBenchSubstitution,
  queueSubstitutions,
  reassignIncomingSubstitution,
  reassignOutgoingSubstitution,
  recordGoal,
  removeQueuedSubstitution,
  removeQueuedSubstitutionForOutgoing,
  setClockRunning,
  startNextPeriod,
  suggestSubstitutions,
  summarizePlayerPositions,
  undoLastEvent,
  validateGame,
  validateSubstitutionPairs,
} from "./domain";
import {
  type DevicePreferences,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./devicePreferences";
import { playSubstitutionAlert, supportsSubstitutionAlert } from "./gameAlert";
import { loadState, saveState } from "./storage";
import { type ColorMode, loadColorMode, saveColorMode } from "./theme";
import { useRotationDueReview } from "./useRotationDueReview";
import { StarterLineup } from "./StarterLineup";
import { PlayerDragPreview } from "./PlayerDragPreview";
import { LiveBenchDropPitch } from "./LiveBenchDropPitch";
import {
  useLiveBenchDrag,
  type LiveBenchDragBindings,
} from "./useLiveBenchDrag";
import { TOUCH_DRAG_HOLD_MS } from "./playerDrag";
import {
  compareStarterPlayersByPreference,
  getStarterLineupAdvice,
} from "./starterLineupModel";
import { formatPlayerLabel, preferredRoleLabel } from "./playerLabels";
import { PlayerIdentity } from "./PlayerIdentity";
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
  | { name: "coach" }
  | { name: "home" }
  | { name: "setup"; teamId: TeamId }
  | { name: "live" }
  | { name: "summary"; game: ActiveGame; teamId: TeamId };

type SummaryReturnLabel =
  "Prep for next game" | "Return to teams" | "Return to coaches";

const coachTeamIds = (coach: Coach) =>
  coach.assignments.map((assignment) => assignment.teamId);

const coachHasTeam = (coach: Coach, teamId: TeamId) =>
  coach.assignments.some((assignment) => assignment.teamId === teamId);

const getCoachLandingScreen = (coach: Coach, state: AppState): Screen => {
  if (state.activeGame && coachHasTeam(coach, state.activeGame.teamId)) {
    return { name: "live" };
  }
  if (!state.activeGame && coach.assignments.length === 1) {
    return { name: "setup", teamId: coach.assignments[0].teamId };
  }
  return { name: "home" };
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const playerName = (team: Team, id: string) =>
  team.roster.find((player) => player.id === id)?.name ?? "Unknown player";

const playerLabel = (team: Team, id: string) => {
  const player = team.roster.find((item) => item.id === id);
  if (!player) return "Unknown player";
  return formatPlayerLabel(player);
};

const playerDialogTitle = (team: Team, id: string, action?: string) => (
  <span className="player-dialog-title">
    <PlayerIdentity
      name={playerName(team, id)}
      number={team.roster.find((player) => player.id === id)?.number}
    />
    {action && (
      <>
        {" "}
        <span className="player-dialog-action">
          <span aria-hidden="true">·</span> {action}
        </span>
      </>
    )}
  </span>
);

const playerGoalCount = (game: ActiveGame, playerId: string) =>
  game.history.filter(
    (event) => event.type === "goal-for" && event.playerId === playerId,
  ).length;

const formatPlayerDuration = (seconds: number, zeroLabel = "0:00") => {
  const safe = Math.max(0, seconds);
  if (safe === 0) return zeroLabel;
  if (safe < 60) return formatDuration(safe);
  return `${Math.round(safe / 60)} min`;
};

const preferredRoleAbbreviation = (role: Player["preferredRoles"][number]) =>
  role === "goalkeeper"
    ? "GK"
    : role === "defender"
      ? "DEF"
      : role === "midfielder"
        ? "MID"
        : "FWD";

const compactPreferredRolesLabel = (roles: Player["preferredRoles"]) =>
  roles.length > 1
    ? roles.map(preferredRoleAbbreviation).join(" · ")
    : roles.map(preferredRoleLabel).join("");

const preferenceFitLabel = (preferenceIndex: number) => {
  if (!Number.isFinite(preferenceIndex)) return "Outside preferences";
  const rank = preferenceIndex + 1;
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";
  return `${rank}${suffix} preference`;
};

const preferenceFitClassName = (preferenceIndex: number) =>
  `replacement-fit preference-rank-${
    Number.isFinite(preferenceIndex)
      ? Math.min(preferenceIndex + 1, 4)
      : "outside"
  }`;

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

function useClockNow(running: boolean) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  return now;
}

function SidelineDialog({
  title,
  description,
  children,
  footer,
  footerClassName = "sheet-actions",
  onClose,
  className = "",
  width = "520px",
  role = "dialog",
  showClose = true,
  bodyClassName,
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  footerClassName?: string;
  onClose: () => void;
  className?: string;
  width?: DialogWidth;
  role?: "dialog" | "alertdialog";
  showClose?: boolean;
  bodyClassName?: string;
}) {
  return (
    <Dialog
      title={title}
      subtitle={description}
      onClose={onClose}
      position={{ narrow: "bottom", regular: "center" }}
      width={width}
      role={role}
      className={`sideline-dialog ${
        children ? "" : "sideline-dialog-bodyless"
      } ${className}`.trim()}
      renderHeader={({
        dialogLabelId,
        dialogDescriptionId,
        onClose: closeDialog,
      }) => (
        <Dialog.Header className="sheet-header">
          <div>
            <h2 id={dialogLabelId}>{title}</h2>
            <p id={dialogDescriptionId}>{description}</p>
          </div>
          {showClose && (
            <IconButton
              className="icon-button"
              variant="invisible"
              size="large"
              icon={X}
              onClick={() => closeDialog("close-button")}
              aria-label="Close"
            />
          )}
        </Dialog.Header>
      )}
    >
      {children && (
        <Dialog.Body className={bodyClassName}>{children}</Dialog.Body>
      )}
      {footer && (
        <Dialog.Footer className={footerClassName}>{footer}</Dialog.Footer>
      )}
    </Dialog>
  );
}

const formatPositionChange = (
  event: GameEvent,
  formation: ReturnType<typeof getFormation>,
  team: Team,
) => {
  if (!event.playerId || !event.fromPositionId || !event.toPositionId) {
    return {
      title: "Position change",
      detail: event.note ?? "Positions updated",
    };
  }

  const fromPosition = formation.positions.find(
    (position) => position.id === event.fromPositionId,
  );
  const toPosition = formation.positions.find(
    (position) => position.id === event.toPositionId,
  );
  const targetPlayerId = event.beforeAssignments[event.toPositionId];
  const movedPlayer = playerName(team, event.playerId);
  const fromLabel = fromPosition?.label ?? event.fromPositionId;
  const toLabel = toPosition?.label ?? event.toPositionId;

  return targetPlayerId
    ? {
        title: `${movedPlayer} ↔ ${playerName(team, targetPlayerId)}`,
        detail: `${fromLabel} ↔ ${toLabel}`,
      }
    : {
        title: `${movedPlayer} moved`,
        detail: `${fromLabel} → ${toLabel}`,
      };
};

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

type WakeLockStatus = "unsupported" | "inactive" | "active" | "error";

function SettingsMenu({
  preferences,
  wakeLockSupported,
  wakeLockStatus,
  substitutionAlertSupported,
  onPreferenceChange,
}: {
  preferences: DevicePreferences;
  wakeLockSupported: boolean;
  wakeLockStatus: WakeLockStatus;
  substitutionAlertSupported: boolean;
  onPreferenceChange: (
    preference: keyof DevicePreferences,
    enabled: boolean,
  ) => void;
}) {
  const wakeLockIssue = !wakeLockSupported
    ? "Not supported by this browser."
    : preferences.keepScreenAwake && wakeLockStatus === "error"
      ? "Enabled, but the device could not keep the screen awake."
      : null;

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <IconButton
          className="settings-button"
          variant="invisible"
          size="large"
          icon={Settings}
          aria-label="Settings"
        />
      </ActionMenu.Anchor>
      <ActionMenu.Overlay
        className="settings-menu"
        align="end"
        side="outside-bottom"
        displayInViewport
        width="medium"
      >
        <div className="settings-menu-header">
          <strong>Game-day settings</strong>
          <small>Saved on this device</small>
        </div>
        <div className="settings-options">
          <div className="settings-option">
            <span className="settings-option-icon" aria-hidden="true">
              <SunMedium size={22} strokeWidth={2.2} />
            </span>
            <span className="settings-option-copy">
              <strong id="keep-screen-awake-label">Keep screen awake</strong>
              <small id="keep-screen-awake-description">
                Prevents auto-lock while Sideline is visible during an active
                game.
              </small>
              {wakeLockIssue && (
                <small id="keep-screen-awake-status" role="status">
                  {wakeLockIssue}
                </small>
              )}
            </span>
            <ToggleSwitch
              checked={preferences.keepScreenAwake}
              disabled={!wakeLockSupported}
              onChange={(enabled) =>
                onPreferenceChange("keepScreenAwake", enabled)
              }
              aria-labelledby="keep-screen-awake-label"
              aria-describedby={
                wakeLockIssue
                  ? "keep-screen-awake-description keep-screen-awake-status"
                  : "keep-screen-awake-description"
              }
            />
          </div>
          <div className="settings-option">
            <span className="settings-option-icon" aria-hidden="true">
              <BellRing size={22} strokeWidth={2.2} />
            </span>
            <span className="settings-option-copy">
              <strong id="substitution-alerts-label">
                Substitution alerts
              </strong>
              <small id="substitution-alerts-description">
                Remind me when to consider substitutions.
              </small>
              {!substitutionAlertSupported && (
                <small id="substitution-alerts-status">
                  Not supported by this browser.
                </small>
              )}
            </span>
            <ToggleSwitch
              checked={preferences.substitutionAlerts}
              disabled={!substitutionAlertSupported}
              onChange={(enabled) =>
                onPreferenceChange("substitutionAlerts", enabled)
              }
              aria-labelledby="substitution-alerts-label"
              aria-describedby={
                substitutionAlertSupported
                  ? "substitution-alerts-description"
                  : "substitution-alerts-description substitution-alerts-status"
              }
            />
          </div>
          <div className="settings-option">
            <span
              className="settings-option-icon settings-option-icon-tardis"
              aria-hidden="true"
            >
              <TardisIcon />
            </span>
            <span className="settings-option-copy">
              <strong id="demo-mode-label">Demo mode</strong>
              <small id="demo-mode-description">
                Become a Time Lord—no blue box required. Enables fast-forward.
              </small>
            </span>
            <ToggleSwitch
              checked={preferences.demoClock}
              onChange={(enabled) => onPreferenceChange("demoClock", enabled)}
              aria-labelledby="demo-mode-label"
              aria-describedby="demo-mode-description"
            />
          </div>
        </div>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

function TardisIcon() {
  return (
    <svg
      className="tardis-icon"
      viewBox="0 0 24 28"
      fill="none"
      aria-hidden="true"
    >
      <path d="M9.5 3.5h5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M11 1.5h2v2h-2zM6.5 6h11l1 2.5v17H5.5v-17l1-2.5Z"
        fill="currentColor"
      />
      <path
        d="M4.5 25.5h15M7 8.5h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.5h4v4h-4zm5 0h4v4h-4z"
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth="0.7"
      />
      <path
        d="M8 16.5h3v7H8zm5 0h3v7h-3z"
        stroke="var(--paper)"
        strokeWidth="0.8"
      />
      <circle cx="10.3" cy="20" r=".55" fill="var(--warm)" />
    </svg>
  );
}

function DemoClockDialog({
  game,
  onChange,
  onClose,
}: {
  game: ActiveGame;
  onChange: (game: ActiveGame) => void;
  onClose: () => void;
}) {
  const [targetMinute, setTargetMinute] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = materializeGame(game, Date.now());
  const currentMatchSeconds = getPeriodStatus(
    current.durationSeconds,
    current.clock.elapsedSeconds,
    current.periodCount,
    current.period,
  ).matchClockSeconds;
  const parsedTargetMinute = Number(targetMinute);
  const validOffset =
    targetMinute.trim() !== "" &&
    Number.isInteger(parsedTargetMinute) &&
    parsedTargetMinute > 0;
  const jumpTargetSeconds = validOffset
    ? currentMatchSeconds + parsedTargetMinute * 60
    : null;
  const submitFastForward = () => {
    if (!validOffset) {
      setError("Enter a positive whole number of minutes.");
      return;
    }
    try {
      onChange(fastForwardGame(game, parsedTargetMinute * 60, Date.now()));
      onClose();
    } catch (fastForwardError) {
      setError(
        fastForwardError instanceof Error
          ? fastForwardError.message
          : "Sideline could not fast-forward the game clock.",
      );
    }
  };

  return (
    <SidelineDialog
      title="Fast-forward"
      description="How far into the future would you like to travel? Sideline advances and then pauses the game clock."
      onClose={onClose}
      className="demo-clock-dialog"
      bodyClassName="demo-clock-dialog-body"
      footer={
        <>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="demo-clock-form"
            variant="primary"
            leadingVisual={FastForward}
            disabled={!validOffset}
          >
            {jumpTargetSeconds === null
              ? "Jump"
              : `Jump to ${formatDuration(jumpTargetSeconds)}`}
          </Button>
        </>
      }
    >
      <form
        id="demo-clock-form"
        className="demo-clock-form"
        onSubmit={(event) => {
          event.preventDefault();
          submitFastForward();
        }}
      >
        <small className="demo-clock-current">
          Current match time:{" "}
          <strong>{formatDuration(currentMatchSeconds)}</strong>
        </small>
        <label htmlFor="demo-clock-minute">Jump forward by minutes</label>
        <input
          id="demo-clock-minute"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={targetMinute}
          autoFocus
          onChange={(event) => {
            setTargetMinute(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <small className="demo-clock-error" role="alert">
            {error}
          </small>
        )}
      </form>
    </SidelineDialog>
  );
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [selectedCoachId, setSelectedCoachId] = useState<CoachId | null>(
    loadCoachId,
  );
  const selectedCoach = getCoach(selectedCoachId);
  const [colorMode, setColorMode] = useState<ColorMode>(() => loadColorMode());
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(
    () => loadDevicePreferences(),
  );
  const wakeLockSupported = Boolean((navigator as WakeLockNavigator).wakeLock);
  const substitutionAlertSupported = supportsSubstitutionAlert();
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>(
    wakeLockSupported ? "inactive" : "unsupported",
  );
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const stateRef = useRef(state);
  const hasActiveGame = Boolean(state.activeGame);
  const [screen, setScreen] = useState<Screen>(() =>
    selectedCoach
      ? getCoachLandingScreen(selectedCoach, state)
      : { name: "coach" },
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

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = colorMode;
    root.dataset.colorMode = colorMode;
    root.dataset.lightTheme = "light";
    root.dataset.darkTheme = "dark_dimmed";
    root.style.colorScheme = colorMode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", colorMode === "dark" ? "#071315" : "#0b3b3f");
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute(
        "content",
        colorMode === "dark" ? "black-translucent" : "default",
      );
    saveColorMode(colorMode);
  }, [colorMode]);

  useEffect(() => {
    const persist = () => saveState(stateRef.current);
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, []);

  useEffect(() => {
    const manager = (navigator as WakeLockNavigator).wakeLock;
    if (!manager) {
      setWakeLockStatus("unsupported");
      return;
    }

    let disposed = false;
    const releaseCurrent = async () => {
      const current = wakeLockRef.current;
      wakeLockRef.current = null;
      if (current && !current.released) {
        try {
          await current.release();
        } catch (error) {
          console.error(
            "Sideline could not release the screen wake lock.",
            error,
          );
        }
      }
      if (!disposed) setWakeLockStatus("inactive");
    };
    const acquire = async () => {
      if (
        disposed ||
        !devicePreferences.keepScreenAwake ||
        !hasActiveGame ||
        document.visibilityState !== "visible"
      ) {
        return;
      }
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setWakeLockStatus("active");
        return;
      }
      try {
        const sentinel = await manager.request("screen");
        if (disposed) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockStatus("active");
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setWakeLockStatus("inactive");
          }
        });
      } catch (error) {
        console.error("Sideline could not keep the screen awake.", error);
        if (!disposed) setWakeLockStatus("error");
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    if (devicePreferences.keepScreenAwake && hasActiveGame) {
      void acquire();
    } else {
      void releaseCurrent();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseCurrent();
    };
  }, [devicePreferences.keepScreenAwake, hasActiveGame]);

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
  const updateDevicePreference = (
    preference: keyof DevicePreferences,
    enabled: boolean,
  ) => {
    const next = { ...devicePreferences, [preference]: enabled };
    if (preference === "substitutionAlerts" && enabled) {
      void playSubstitutionAlert();
    }
    setDevicePreferences(next);
    saveDevicePreferences(next);
  };
  const chooseTeam = (teamId: TeamId) => {
    if (state.activeGame?.teamId === teamId) {
      setScreen({ name: "live" });
    } else {
      setScreen({ name: "setup", teamId });
    }
  };
  const goToCoachLanding = () => {
    setScreen(
      selectedCoach
        ? getCoachLandingScreen(selectedCoach, stateRef.current)
        : { name: "coach" },
    );
  };
  const selectCoach = (coachId: CoachId) => {
    const coach = getCoach(coachId);
    if (!coach) return;
    saveCoachId(coachId);
    setSelectedCoachId(coachId);
    setScreen(getCoachLandingScreen(coach, stateRef.current));
  };
  const signOut = () => {
    saveCoachId(null);
    setSelectedCoachId(null);
    setScreen({ name: "coach" });
  };

  return (
    <ThemeProvider
      colorMode={colorMode}
      dayScheme="light"
      nightScheme="dark_dimmed"
    >
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="topbar">
          <button
            className="brand"
            type="button"
            onClick={() => goToCoachLanding()}
            aria-label={
              selectedCoach &&
              state.activeGame &&
              coachHasTeam(selectedCoach, state.activeGame.teamId)
                ? "Go to active game"
                : selectedCoach
                  ? "Go to coach home"
                  : "Go to coach selection"
            }
          >
            <SidelineMark />
            <span>Sideline</span>
          </button>
          <div className="topbar-actions">
            {selectedCoach && (
              <Button
                className="coach-switcher"
                variant="invisible"
                size="large"
                leadingVisual={UsersRound}
                trailingVisual={MoveHorizontal}
                aria-label={`Change coaches. Current coach: ${selectedCoach.name}`}
                title="Change coaches"
                onClick={signOut}
              >
                {selectedCoach.name}
              </Button>
            )}
            <IconButton
              className="theme-toggle"
              variant="invisible"
              size="large"
              icon={colorMode === "dark" ? Sun : Moon}
              aria-label={
                colorMode === "dark" ? "Use light mode" : "Use dark mode"
              }
              onClick={() =>
                setColorMode((current) =>
                  current === "dark" ? "light" : "dark",
                )
              }
            />
            <SettingsMenu
              preferences={devicePreferences}
              wakeLockSupported={wakeLockSupported}
              wakeLockStatus={wakeLockStatus}
              substitutionAlertSupported={substitutionAlertSupported}
              onPreferenceChange={updateDevicePreference}
            />
          </div>
        </header>

        <main id="main">
          {screen.name === "coach" && (
            <CoachScreen
              state={state}
              onChooseCoach={selectCoach}
              onEndActiveGame={(game) => {
                commitState((current) => ({ ...current, activeGame: null }));
                setScreen({ name: "summary", game, teamId: game.teamId });
              }}
              showInstall={!installed}
              onInstall={installApp}
            />
          )}
          {screen.name === "home" && (
            <HomeScreen
              state={state}
              teamIds={selectedCoach ? coachTeamIds(selectedCoach) : []}
              onChooseTeam={chooseTeam}
              onResume={() => setScreen({ name: "live" })}
            />
          )}
          {screen.name === "setup" && (
            <SetupScreen
              team={state.teams[screen.teamId]}
              onBack={
                selectedCoach && selectedCoach.assignments.length > 1
                  ? () => setScreen({ name: "home" })
                  : undefined
              }
              onStart={(game) => {
                commitState((current) => updateActiveGame(current, game));
                setScreen({ name: "live" });
              }}
            />
          )}
          {screen.name === "live" && state.activeGame && activeTeam && (
            <LiveGameScreen
              game={state.activeGame}
              team={activeTeam}
              substitutionAlertsEnabled={devicePreferences.substitutionAlerts}
              demoClockEnabled={devicePreferences.demoClock}
              summaryReturnLabel={
                selectedCoach?.assignments.length === 1
                  ? "Prep for next game"
                  : "Return to teams"
              }
              onChange={(game) =>
                commitState((current) => updateActiveGame(current, game))
              }
              onEnd={(game) => {
                commitState((current) => ({ ...current, activeGame: null }));
                setScreen({ name: "summary", game, teamId: game.teamId });
              }}
            />
          )}
          {screen.name === "summary" && (
            <GameSummary
              game={screen.game}
              team={teamWithGameGuests(state.teams[screen.teamId], screen.game)}
              returnLabel={
                !selectedCoach
                  ? "Return to coaches"
                  : selectedCoach.assignments.length === 1
                    ? "Prep for next game"
                    : "Return to teams"
              }
              onClose={() => {
                if (!selectedCoach) {
                  setScreen({ name: "coach" });
                } else if (selectedCoach.assignments.length === 1) {
                  setScreen({
                    name: "setup",
                    teamId: selectedCoach.assignments[0].teamId,
                  });
                } else {
                  setScreen({ name: "home" });
                }
              }}
            />
          )}
          {screen.name === "live" && !state.activeGame && (
            <EmptyState
              title="No active game"
              body="Choose a team to prepare a new match."
              action="Choose a team"
              onAction={() => goToCoachLanding()}
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
    </ThemeProvider>
  );
}

function PrivacyNote() {
  return (
    <p className="privacy-note">
      <ShieldCheck size={17} aria-hidden="true" />
      <span>
        Sideline works offline. Names and game data stay in this browser.
      </span>
    </p>
  );
}

function CoachScreen({
  state,
  onChooseCoach,
  onEndActiveGame,
  showInstall,
  onInstall,
}: {
  state: AppState;
  onChooseCoach: (coachId: CoachId) => void;
  onEndActiveGame: (game: ActiveGame) => void;
  showInstall: boolean;
  onInstall: () => void;
}) {
  const [endConfirm, setEndConfirm] = useState(false);
  const activeGame = state.activeGame;
  const activeTeam = activeGame ? state.teams[activeGame.teamId] : null;
  return (
    <div className="page coach-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Local coach profile</span>
          <h1>Who’s coaching?</h1>
          <p>
            Choose your name to see your teams. No password required on this
            device.
          </p>
        </div>
      </section>

      {activeGame && activeTeam && (
        <section
          className="coach-game-recovery"
          aria-label={`${activeTeam.name} game in progress`}
        >
          <span className="resume-pulse" aria-hidden="true" />
          <span>
            <strong>{activeTeam.name} game in progress</strong>
            <small>
              Choose a coach assigned to {activeTeam.name} to resume the game,
              or end it here.
            </small>
          </span>
          <Button
            className="danger-action"
            variant="danger"
            size="medium"
            leadingVisual={Flag}
            aria-label={`End ${activeTeam.name} game`}
            onClick={() => setEndConfirm(true)}
          >
            End game
          </Button>
        </section>
      )}

      <div className="coach-ledger">
        {COACHES.map((coach) => {
          const blockedByActiveGame = Boolean(
            activeTeam && !coachHasTeam(coach, activeTeam.id),
          );
          const assignmentLabel = coach.assignments
            .map(
              (assignment) =>
                `${state.teams[assignment.teamId].name}, ${assignment.role}${
                  state.activeGame?.teamId === assignment.teamId
                    ? ", live game in progress"
                    : ""
                }`,
            )
            .join(". ");
          return (
            <button
              className={`coach-row ${blockedByActiveGame ? "blocked" : ""}`}
              type="button"
              key={coach.id}
              aria-disabled={blockedByActiveGame}
              onClick={() => {
                if (!blockedByActiveGame) onChooseCoach(coach.id);
              }}
              aria-label={
                blockedByActiveGame && activeTeam
                  ? `${coach.name} unavailable. ${activeTeam.name} game in progress. ${assignmentLabel}`
                  : `Continue as ${coach.name}. ${assignmentLabel}`
              }
            >
              <span className="coach-row-main">
                <strong>{coach.name}</strong>
                <span className="coach-assignments">
                  {coach.assignments.map((assignment) => (
                    <span className="coach-assignment" key={assignment.teamId}>
                      <TeamCrest teamId={assignment.teamId} mini />
                      <small>
                        {state.teams[assignment.teamId].name} ·{" "}
                        {assignment.role}
                        {state.activeGame?.teamId === assignment.teamId && (
                          <span className="coach-team-active">
                            {" "}
                            · Live game
                          </span>
                        )}
                      </small>
                    </span>
                  ))}
                </span>
                {blockedByActiveGame && activeTeam && (
                  <span className="coach-blocked-note">
                    {activeTeam.name} game active
                  </span>
                )}
              </span>
              {blockedByActiveGame ? (
                <CircleAlert size={20} aria-hidden="true" />
              ) : (
                <ChevronRight size={22} aria-hidden="true" />
              )}
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

      <PrivacyNote />
      {endConfirm && activeGame && activeTeam && (
        <ConfirmSheet
          title={`End ${activeTeam.name} game?`}
          body={`This will stop the clock, cancel any ready substitutions, and end the ${activeTeam.name} game. You’ll see the game summary next.`}
          cancelLabel="Keep game"
          confirmLabel="End game"
          confirmIcon={<Flag size={18} aria-hidden="true" />}
          showClose
          onCancel={() => setEndConfirm(false)}
          onConfirm={() => {
            const finalGame = cancelQueuedSubstitutions(
              finalizeGame(activeGame, Date.now()),
            );
            setEndConfirm(false);
            onEndActiveGame(finalGame);
          }}
        />
      )}
    </div>
  );
}

function HomeScreen({
  state,
  teamIds,
  onChooseTeam,
  onResume,
}: {
  state: AppState;
  teamIds: TeamId[];
  onChooseTeam: (teamId: TeamId) => void;
  onResume: () => void;
}) {
  const activeTeam = state.activeGame
    ? state.teams[state.activeGame.teamId]
    : null;
  const now = useClockNow(Boolean(state.activeGame?.clock.running));
  const displayedGame = state.activeGame
    ? materializeGame(state.activeGame, now)
    : null;
  const activePeriod = displayedGame
    ? getPeriodStatus(
        displayedGame.durationSeconds,
        displayedGame.clock.elapsedSeconds,
        displayedGame.periodCount,
        displayedGame.period,
      )
    : null;
  const canResumeActiveGame = Boolean(
    activeTeam && teamIds.includes(activeTeam.id),
  );
  const hasBlockedActiveGame = Boolean(
    state.activeGame && !canResumeActiveGame,
  );
  const teams = teamIds.map((teamId) => state.teams[teamId]);
  return (
    <div className="page home-page">
      <section className="page-heading">
        <div>
          <h1>{teams.length === 1 ? "Your team" : "Which team is playing?"}</h1>
          <p>
            {hasBlockedActiveGame
              ? `${activeTeam?.name ?? "Another team"} has a game in progress on this device. Sign in as one of its coaches to resume it.`
              : state.activeGame
                ? "Resume the game in progress. Each team’s game state stays separate."
                : "Choose a team to start a game. Each team’s game state stays separate."}
          </p>
        </div>
      </section>

      {displayedGame && activeTeam && canResumeActiveGame && (
        <button className="resume-strip" type="button" onClick={onResume}>
          <span className="resume-pulse" aria-hidden="true" />
          <span>
            <strong>Game in progress · {activeTeam.name}</strong>
            <small>
              {activePeriod?.regulationReached && !displayedGame.periodBreak
                ? `Added time +${formatDuration(activePeriod.addedTimeSeconds)}`
                : displayedGame.periodBreak
                  ? `${activePeriod?.label ?? "Period"} ${displayedGame.periodBreak.completedPeriod} ended`
                  : displayedGame.clock.running
                    ? "Clock running"
                    : "Clock paused"}{" "}
              · {formatDuration(activePeriod?.matchClockSeconds ?? 0)}
            </small>
          </span>
          <span className="resume-action">
            Resume <ChevronRight size={20} aria-hidden="true" />
          </span>
        </button>
      )}

      <div className="team-ledger">
        {teams.map((team) => {
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
                <span className="locked-note">{activeTeam?.name} active</span>
              )}
              <ChevronRight size={22} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <PrivacyNote />
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
  const instructions = ios
    ? "In Safari, tap the Share button, choose Add to Home Screen, then tap Add."
    : "Open your browser menu and choose Install app or Add to Home screen.";

  return (
    <SidelineDialog
      title="Install Sideline"
      description={instructions}
      className="confirm-sheet"
      width="480px"
      showClose={false}
      onClose={onClose}
      footer={
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          onClick={onClose}
        >
          Got it
        </Button>
      }
    />
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
    <SidelineDialog
      title="Add guest player"
      description="This player will exist only for this game."
      className="compact-sheet position-editor-sheet"
      onClose={onClose}
      footer={
        <>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="primary-action"
            type="submit"
            form="guest-player-form"
            variant="primary"
            size="large"
            leadingVisual={CirclePlus}
            disabled={!trimmedName}
          >
            Add guest
          </Button>
        </>
      }
    >
      <form
        id="guest-player-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedName) return;
          onAdd(trimmedName, number ? Number.parseInt(number, 10) : undefined);
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
      </form>
    </SidelineDialog>
  );
}

const U8_GAME_FORMATS = [
  {
    id: "quarters-10",
    label: "4 quarters · 10:00 each",
    durationMinutes: 40,
    periodCount: 4,
  },
  {
    id: "halves-20",
    label: "2 halves · 20:00 each",
    durationMinutes: 40,
    periodCount: 2,
  },
  {
    id: "halves-25",
    label: "2 halves · 25:00 each",
    durationMinutes: 50,
    periodCount: 2,
  },
] as const;

function SetupScreen({
  team,
  onBack,
  onStart,
}: {
  team: Team;
  onBack?: () => void;
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
  const defaultGameFormat =
    U8_GAME_FORMATS.find(
      (format) =>
        format.durationMinutes === team.defaultDurationMinutes &&
        format.periodCount === team.defaultPeriodCount,
    ) ?? U8_GAME_FORMATS[0];
  const [gameFormatId, setGameFormatId] = useState(defaultGameFormat.id);
  const gameFormat =
    U8_GAME_FORMATS.find((format) => format.id === gameFormatId) ??
    defaultGameFormat;
  const [setupStep, setSetupStep] = useState<0 | 1 | 2>(0);
  const [starterPositionId, setStarterPositionId] = useState<string | null>(
    null,
  );
  const formation = getFormation(formationId);
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    assignStartingPlayersByPreference(
      formation,
      activePlayers.map((player) => player.id),
      team.roster,
      team.lastStartingLineup,
    ),
  );
  const [starterUndo, setStarterUndo] = useState<{
    assignments: Record<string, string>;
    presentIds: string[];
    formationId: string;
    hasManualChoices: boolean;
  } | null>(null);
  const [hasManualStarterChoices, setHasManualStarterChoices] = useState(false);
  const canUndoStarters =
    starterUndo?.presentIds === presentIds &&
    starterUndo.formationId === formationId;
  const changeStarterAssignments = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => {
    const next = update(assignments);
    if (JSON.stringify(next) === JSON.stringify(assignments)) return;
    setStarterUndo({
      assignments,
      presentIds,
      formationId,
      hasManualChoices: hasManualStarterChoices,
    });
    setHasManualStarterChoices(true);
    setAssignments(next);
  };

  const changeFormation = (nextFormationId: string) => {
    setStarterUndo(null);
    setHasManualStarterChoices(false);
    const nextFormation = getFormation(nextFormationId);
    const present = activePlayers.filter((player) =>
      presentIds.includes(player.id),
    );
    setFormationId(nextFormationId);
    setAssignments(
      assignStartingPlayersByPreference(
        nextFormation,
        present.map((player) => player.id),
        setupTeam.roster,
        team.lastStartingLineup,
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
    changeStarterAssignments((currentAssignments) =>
      fillStartingLineup(
        formation,
        currentAssignments,
        presentIds,
        setupTeam.roster,
        team.lastStartingLineup,
      ),
    );
  };

  const resetStarters = () =>
    changeStarterAssignments(() =>
      Object.fromEntries(
        formation.positions.map((position) => [position.id, ""]),
      ),
    );

  const toggleAttendance = (playerId: string) => {
    setStarterUndo(null);
    setPresentIds((current) => {
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      setAssignments((currentAssignments) => {
        if (!hasManualStarterChoices) {
          return assignStartingPlayersByPreference(
            formation,
            activePlayers
              .filter((player) => next.includes(player.id))
              .map((player) => player.id),
            setupTeam.roster,
            team.lastStartingLineup,
          );
        }
        return fillStartingLineup(
          formation,
          currentAssignments,
          next,
          setupTeam.roster,
          team.lastStartingLineup,
        );
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
      team.id === "u8"
        ? gameFormat.durationMinutes
        : team.defaultDurationMinutes,
      Date.now(),
      team.id === "u8" ? gameFormat.periodCount : team.defaultPeriodCount,
    );
    game.assignments = Object.fromEntries(
      Object.entries(assignments).filter(([, id]) => Boolean(id)),
    );
    game.benchIds = benchIds;
    game.guestPlayers = guestPlayers.map((player) => ({ ...player }));
    onStart(game);
  };

  const teamPlayers = activePlayers
    .filter((player) => !player.guest)
    .sort(comparePlayersByNameThenNumber);
  const activeGuestPlayers = activePlayers
    .filter((player) => player.guest)
    .sort(comparePlayersByNameThenNumber);
  const renderAttendanceButton = (player: Player) => {
    const present = presentIds.includes(player.id);
    return (
      <button
        className={`attendance-button ${present ? "selected" : ""}`}
        type="button"
        key={player.id}
        aria-pressed={present}
        aria-label={`${player.name} ${player.guest ? "Guest · " : ""}${present ? "Present" : "Absent"}`}
        onClick={() => toggleAttendance(player.id)}
      >
        <span className="attendance-check" aria-hidden="true">
          {present ? <Check size={17} /> : <X size={17} />}
        </span>
        <span>
          <span className="attendance-player-heading">
            <strong>
              <PlayerIdentity name={player.name} number={player.number} />
            </strong>
          </span>
          <small>
            {player.guest ? "Guest · " : ""}
            {present ? "Present" : "Absent"}
          </small>
        </span>
      </button>
    );
  };
  const teamIdentity = (
    <>
      <span>
        <strong>{team.name}</strong>
        <span className="setup-team-meta">
          <small>
            {team.ageGroup} · {team.sideSize}v{team.sideSize}
          </small>
          {onBack && (
            <small className="setup-team-change">
              <MoveHorizontal size={12} aria-hidden="true" />
              Change
            </small>
          )}
        </span>
      </span>
      <TeamCrest teamId={team.id} mini />
    </>
  );

  return (
    <div className="page setup-page">
      <section className="page-heading setup-page-heading">
        <h1>Prepare game</h1>
        {onBack ? (
          <button
            className="setup-team-lockup setup-team-switcher"
            type="button"
            aria-label={`Change team. Current team: ${team.name}`}
            title="Change team"
            onClick={onBack}
          >
            {teamIdentity}
          </button>
        ) : (
          <div className="setup-team-lockup">{teamIdentity}</div>
        )}
        <p>Set the squad, shape, and starters.</p>
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
                  {team.sideSize} game. Add a guest or prepare to have very
                  tired kids playing short-sided.
                </span>
              </div>
            </div>
          )}
          <div className="attendance-grid">
            {teamPlayers.map((player) => renderAttendanceButton(player))}
          </div>
          <section
            className="guest-attendance-section"
            aria-labelledby="guest-attendance-title"
          >
            <div className="section-title">
              <h3 id="guest-attendance-title">Guest players</h3>
              <div className="guest-attendance-meta">
                <span>
                  {activeGuestPlayers.length}{" "}
                  {activeGuestPlayers.length === 1 ? "guest" : "guests"}
                </span>
                <IconButton
                  className="guest-add-button"
                  variant="default"
                  size="large"
                  icon={CirclePlus}
                  onClick={() => setGuestPlayerOpen(true)}
                  aria-label="Add guest player"
                />
              </div>
            </div>
            {activeGuestPlayers.length > 0 && (
              <div className="guest-attendance-list">
                {activeGuestPlayers.map((player) => (
                  <div
                    className="guest-attendance-row"
                    role="group"
                    aria-label={`${player.name}, guest player`}
                    key={player.id}
                  >
                    <div className="guest-attendance-player">
                      <span className="attendance-check" aria-hidden="true">
                        <Check size={17} />
                      </span>
                      <span>
                        <span className="attendance-player-heading">
                          <strong>
                            <PlayerIdentity
                              name={player.name}
                              number={player.number}
                            />
                          </strong>
                        </span>
                        <small>Guest · Present</small>
                      </span>
                    </div>
                    <IconButton
                      className="guest-remove-button"
                      variant="invisible"
                      size="large"
                      icon={Trash2}
                      onClick={() => removeGuestPlayer(player.id)}
                      aria-label={`Remove guest ${player.name}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
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
                value={gameFormatId}
                onChange={(event) =>
                  setGameFormatId(
                    event.target
                      .value as (typeof U8_GAME_FORMATS)[number]["id"],
                  )
                }
              >
                {U8_GAME_FORMATS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
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
                Drag players to swap; on phones, hold a player first. Or tap a
                bench player, then a position.
              </p>
            </div>
            <span>
              {assignmentCount}/{expectedOnField} assigned
            </span>
          </div>
          <div className="starter-tools">
            <Button
              className="quiet-button"
              variant="invisible"
              size="large"
              leadingVisual={RotateCcw}
              aria-label="Undo lineup change"
              title="Undo lineup change"
              disabled={!canUndoStarters}
              onClick={() => {
                if (!starterUndo || !canUndoStarters) return;
                setAssignments(starterUndo.assignments);
                setHasManualStarterChoices(starterUndo.hasManualChoices);
                setStarterUndo(null);
              }}
            >
              Undo
            </Button>
            <Button
              className="secondary-action"
              variant="default"
              size="large"
              leadingVisual={WandSparkles}
              disabled={assignmentCount === expectedOnField}
              onClick={autoFillStarters}
            >
              Auto-fill
            </Button>
            <Button
              className="quiet-button"
              variant="invisible"
              size="large"
              leadingVisual={RotateCcw}
              onClick={resetStarters}
            >
              Reset
            </Button>
          </div>
          <StarterLineup
            key={`${formationId}:${presentIds.join(",")}`}
            formation={formation}
            assignments={assignments}
            players={activePlayers.filter((player) =>
              presentIds.includes(player.id),
            )}
            onChoosePosition={setStarterPositionId}
            onMove={(playerId, positionId) =>
              changeStarterAssignments((current) =>
                assignPlayerToPosition(current, positionId, playerId),
              )
            }
          />
        </section>
      )}

      <div className="setup-submit">
        {setupStep > 0 && (
          <Button
            className="secondary-action setup-back"
            variant="default"
            size="large"
            leadingVisual={ArrowLeft}
            onClick={() => goToStep((setupStep - 1) as 0 | 1)}
          >
            {setupSteps[setupStep - 1].label}
          </Button>
        )}
        {setupStep < 2 ? (
          <Button
            className="primary-action"
            variant="primary"
            size="large"
            trailingVisual={ArrowRight}
            onClick={() => goToStep((setupStep + 1) as 1 | 2)}
          >
            {setupSteps[setupStep + 1].label}
          </Button>
        ) : (
          <Button
            className="primary-action"
            variant="primary"
            size="large"
            leadingVisual={Play}
            disabled={!canStart}
            onClick={() =>
              attendanceShortfall > 0 ? setShortStartConfirm(true) : start()
            }
          >
            {attendanceShortfall > 0 ? "Start short-sided" : "Start game"}
          </Button>
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
            changeStarterAssignments((current) =>
              assignPlayerToPosition(current, starterPositionId, playerId),
            );
            setStarterPositionId(null);
          }}
          onClear={() => {
            changeStarterAssignments((current) => ({
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
  substitutionAlertsEnabled,
  demoClockEnabled,
  summaryReturnLabel,
  onChange,
  onEnd,
}: {
  game: ActiveGame;
  team: Team;
  substitutionAlertsEnabled: boolean;
  demoClockEnabled: boolean;
  summaryReturnLabel: SummaryReturnLabel;
  onChange: (game: ActiveGame) => void;
  onEnd: (game: ActiveGame) => void;
}) {
  const now = useClockNow(game.clock.running);
  const [headerCollapseProgress, setHeaderCollapseProgress] = useState(0);
  const [mobileViewport, setMobileViewport] = useState(
    () => window.innerWidth <= 760,
  );
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [queuedPlanOpen, setQueuedPlanOpen] = useState(false);
  const [goalScorerOpen, setGoalScorerOpen] = useState(false);
  const [goalSummaryOpen, setGoalSummaryOpen] = useState(false);
  const [guestPositionId, setGuestPositionId] = useState<string | null>(null);
  const [guestBenchOpen, setGuestBenchOpen] = useState(false);
  const [benchQueuePlayerId, setBenchQueuePlayerId] = useState<string | null>(
    null,
  );
  const [fieldQueuePlayerId, setFieldQueuePlayerId] = useState<string | null>(
    null,
  );
  const [rosterView, setRosterView] = useState<"field" | "bench">("bench");
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
  const [unavailableConfirmPlayerId, setUnavailableConfirmPlayerId] = useState<
    string | null
  >(null);
  const [endConfirm, setEndConfirm] = useState(false);
  const [demoClockOpen, setDemoClockOpen] = useState(false);
  const [error, setError] = useState("");
  const alertedReminderCycle = useRef<string | null>(null);
  const previousAlertsEnabled = useRef(substitutionAlertsEnabled);
  const formation = getFormation(game.formationId);
  const compactDemoControls = demoClockEnabled && mobileViewport;

  useEffect(() => {
    const updateHeader = () =>
      setHeaderCollapseProgress(
        Math.min(1, Math.max(0, (window.scrollY - 32) / 96)),
      );
    updateHeader();
    const updateViewport = () => setMobileViewport(window.innerWidth <= 760);
    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    const recoverVisibleGame = () => {
      if (
        document.visibilityState !== "visible" ||
        !game.clock.running ||
        game.clock.lastStartedAt === null
      ) {
        return;
      }
      const recovered = materializeGame(game, Date.now());
      if (recovered !== game) onChange(recovered);
    };

    document.addEventListener("visibilitychange", recoverVisibleGame);
    window.addEventListener("pageshow", recoverVisibleGame);
    return () => {
      document.removeEventListener("visibilitychange", recoverVisibleGame);
      window.removeEventListener("pageshow", recoverVisibleGame);
    };
  }, [game, onChange]);

  const displayed = materializeGame(game, now);
  const fieldIds = Object.values(game.assignments);
  const currentFieldTimes = Object.fromEntries(
    fieldIds.map((id) => [id, getCurrentFieldSeconds(displayed, id)]),
  );
  const sortedFieldPositions = formation.positions
    .map((position, formationIndex) => ({
      position,
      formationIndex,
      playerId: game.assignments[position.id],
    }))
    .filter(
      (
        entry,
      ): entry is {
        position: (typeof formation.positions)[number];
        formationIndex: number;
        playerId: string;
      } => Boolean(entry.playerId),
    )
    .sort(
      (a, b) =>
        currentFieldTimes[b.playerId] - currentFieldTimes[a.playerId] ||
        a.formationIndex - b.formationIndex,
    );
  const showFieldPlayerTimes = fieldIds.some(
    (id) => currentFieldTimes[id] !== displayed.clock.elapsedSeconds,
  );
  const benchTimes = Object.fromEntries(
    game.benchIds.map((id) => [id, getCurrentBenchSeconds(displayed, id)]),
  );
  const sortedBenchIds = game.benchIds
    .map((id, benchIndex) => ({ id, benchIndex }))
    .sort(
      (a, b) =>
        benchTimes[b.id] - benchTimes[a.id] || a.benchIndex - b.benchIndex,
    )
    .map(({ id }) => id);
  const benchSinceStartCount = game.benchIds.filter(
    (id) => benchTimes[id] === displayed.clock.elapsedSeconds,
  ).length;
  const showBenchSinceStartCohort = benchSinceStartCount >= 2;
  const goalkeeperPositionId = formation.positions.find(
    (position) => position.role === "goalkeeper",
  )?.id;
  const scorerIds = fieldIds.filter(
    (playerId) => game.assignments[goalkeeperPositionId ?? ""] !== playerId,
  );
  const period = getPeriodStatus(
    game.durationSeconds,
    displayed.clock.elapsedSeconds,
    game.periodCount,
    displayed.period,
  );
  const remaining = period.regulationRemainingSeconds;
  const score = getScore(game);
  const goalScorers = summarizePlayerPositions(game).filter(
    (summary) => summary.goals.length > 0,
  );
  const validationErrors = validateGame(game, team.sideSize);
  const queuedPairs = game.queuedSubstitutions ?? [];
  const queuedPlanErrors = validateSubstitutionPairs(game, queuedPairs);
  const periodBreak = displayed.periodBreak;
  const periodBoundaryReached = period.regulationReached && !periodBreak;
  const periodShortLabel = `${period.count === 4 ? "Q" : "H"}${period.current}`;
  const breakAddedTimeSeconds = periodBreak ? period.addedTimeSeconds : 0;
  const substitutionReminder = getSubstitutionReminderStatus(displayed);
  const routineRotation = getRoutineRotationStatus(displayed);
  const rotationTimingLabel = !routineRotation.recommended
    ? "No more scheduled"
    : !routineRotation.promptRecommended
      ? "At the break"
      : substitutionReminder.due
        ? "Due now"
        : `Due in ${formatDuration(
            Math.max(
              0,
              substitutionReminder.intervalSeconds -
                substitutionReminder.secondsSinceLastSubstitution,
            ),
          )}`;
  const goalkeeperPreparationWarning = routineRotation.promptRecommended
    ? getGoalkeeperPreparationWarning(displayed, team)
    : null;
  const keeperPreparationNote = goalkeeperPreparationWarning ? (
    <small
      className="rotation-preparation-note"
      role="status"
      aria-live={queuedPairs.length > 0 ? "polite" : "off"}
      aria-label="Goalkeeper preparation"
    >
      {goalkeeperPreparationWarning}
    </small>
  ) : null;
  const rotationDue =
    routineRotation.promptRecommended &&
    substitutionReminder.due &&
    game.benchIds.length > 0 &&
    !periodBreak &&
    !periodBoundaryReached;
  const showSubstitutionReminder = rotationDue && queuedPairs.length === 0;
  const reminderCycleKey = substitutionReminder.cycleKey;
  const compactHeaderInteractive = headerCollapseProgress > 0.8;
  const clockActionLabel = game.clock.running
    ? "Pause"
    : periodBreak && !periodBreak.final
      ? `Start ${period.count === 4 ? "Q" : "H"}${
          periodBreak.completedPeriod + 1
        }`
      : periodBreak?.final
        ? "Resume"
        : displayed.clock.elapsedSeconds > displayed.period.startedAtSeconds
          ? "Resume"
          : period.current === 1
            ? "Start game"
            : `Start ${periodShortLabel}`;
  const changeClockState = () =>
    periodBreak && !periodBreak.final
      ? startNextPeriod(game, Date.now())
      : setClockRunning(game, !game.clock.running);

  useEffect(() => {
    const justEnabled =
      substitutionAlertsEnabled && !previousAlertsEnabled.current;
    previousAlertsEnabled.current = substitutionAlertsEnabled;
    if (
      !substitutionAlertsEnabled ||
      !rotationDue ||
      alertedReminderCycle.current === reminderCycleKey
    ) {
      return;
    }
    alertedReminderCycle.current = reminderCycleKey;
    // Enabling the setting already previews this alert.
    if (!justEnabled) void playSubstitutionAlert();
  }, [reminderCycleKey, rotationDue, substitutionAlertsEnabled]);

  useRotationDueReview({
    cycleKey: reminderCycleKey,
    due: substitutionReminder.due,
    eligible: rotationDue && game.clock.running,
    now,
    onOpen: () => {
      if (queuedPairs.length > 0) setQueuedPlanOpen(true);
      else setPlannerOpen(true);
    },
  });

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

  const sendSingleSubstitution = (inPlayerId: string, outPlayerId: string) => {
    let executedPairs: SubstitutionPair[] = [];
    const succeeded = safeChange(() => {
      const next = applyImmediateSubstitution(
        game,
        inPlayerId,
        outPlayerId,
        team,
        Date.now(),
      );
      const event = next.history.at(-1);
      if (event?.type !== "substitution") {
        throw new Error("The immediate substitution could not be verified.");
      }
      executedPairs = event.pairs;
      return next;
    });
    if (succeeded) {
      setBenchQueuePlayerId(null);
      setFieldQueuePlayerId(null);
      setConfirmedPairs(executedPairs);
    }
    return succeeded;
  };

  const benchDrag = useLiveBenchDrag({
    lineupKey: JSON.stringify([
      game.id,
      game.assignments,
      game.benchIds,
      game.unavailableIds,
    ]),
    assignments: game.assignments,
    benchIds: game.benchIds,
    onDrop: sendSingleSubstitution,
  });
  const activeBenchDrag = benchDrag.drag?.active ? benchDrag.drag : null;
  const draggedBenchPlayer = activeBenchDrag
    ? team.roster.find((player) => player.id === activeBenchDrag.playerId)
    : undefined;
  const benchDropPositionId = activeBenchDrag?.targetPositionId;
  const benchDropNotice = getKeeperChangeNotice(
    displayed,
    team,
    draggedBenchPlayer &&
      benchDropPositionId &&
      game.assignments[benchDropPositionId]
      ? [
          {
            inPlayerId: draggedBenchPlayer.id,
            outPlayerId: game.assignments[benchDropPositionId],
            positionId: benchDropPositionId,
          },
        ]
      : [],
    "now",
    { warnAboutRest: false, compact: true },
  );

  const moveRosterTabFocus = (view: "field" | "bench") => {
    setRosterView(view);
    window.requestAnimationFrame(() =>
      document.getElementById(`roster-${view}-tab`)?.focus(),
    );
  };

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
          <div className="match-header-actions" aria-label="Match controls">
            {compactDemoControls ? (
              <IconButton
                className={`match-clock-button demo-match-header-action ${
                  game.clock.running ? "" : "turf-clock-action"
                }`}
                variant="default"
                size="large"
                icon={game.clock.running ? Pause : Play}
                aria-label={clockActionLabel}
                onClick={() => safeChange(changeClockState)}
              />
            ) : (
              <Button
                className={`match-clock-button ${
                  game.clock.running ? "" : "turf-clock-action"
                }`}
                variant="default"
                size="medium"
                leadingVisual={game.clock.running ? Pause : Play}
                aria-label={clockActionLabel}
                onClick={() => safeChange(changeClockState)}
              >
                {clockActionLabel}
              </Button>
            )}
            {demoClockEnabled && (
              <IconButton
                className="match-fast-forward-button demo-match-header-action"
                variant="default"
                size="large"
                icon={FastForward}
                aria-label="Fast-forward game clock"
                onClick={() => setDemoClockOpen(true)}
              />
            )}
            {compactDemoControls ? (
              <IconButton
                className="demo-match-header-action"
                variant="danger"
                size="large"
                icon={Flag}
                aria-label="End game"
                onClick={() => setEndConfirm(true)}
              />
            ) : (
              <Button
                variant="danger"
                size="medium"
                leadingVisual={Flag}
                aria-label="End game"
                onClick={() => setEndConfirm(true)}
              >
                <span className="match-end-copy-long">End game</span>
                <span className="match-end-copy-short">End</span>
              </Button>
            )}
          </div>
        </header>

        <section className="match-metrics" aria-label="Match status">
          <div
            className="game-clock"
            aria-label={`Game clock, ${game.clock.running ? "running" : "paused"}`}
          >
            <span
              className={`game-clock-icon ${
                game.clock.running ? "running" : ""
              } ${periodBoundaryReached ? "added-time" : ""}`}
              aria-hidden="true"
            >
              <Clock3 size={22} />
            </span>
            <strong>{formatDuration(period.matchClockSeconds)}</strong>
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

          <div
            className={`clock-secondary ${
              periodBoundaryReached ? "added-time" : ""
            }`}
          >
            <span>
              <small>
                {period.label} {period.current}
              </small>
              <strong>
                {period.regulationReached
                  ? `+${formatDuration(period.addedTimeSeconds)}`
                  : `${formatDuration(period.remainingSeconds)} left`}
              </strong>
            </span>
            <span>
              {period.regulationReached
                ? `Regulation reached for this ${period.label.toLowerCase()}`
                : `${formatDuration(remaining)} regulation remaining`}
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
        <div className="compact-match-team">
          <TeamCrest teamId={team.id} mini />
          <strong title={team.name}>{team.name}</strong>
        </div>
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
        <div className="compact-match-management">
          <div className="compact-match-timing">
            <span
              className={`compact-match-period ${
                periodBoundaryReached ? "added-time" : ""
              }`}
              aria-label={`${period.label} ${period.current}`}
            >
              {periodShortLabel}
            </span>
            <span
              className={`compact-match-clock ${
                periodBoundaryReached ? "added-time" : ""
              }`}
            >
              <strong>{formatDuration(period.matchClockSeconds)}</strong>
              {periodBoundaryReached && (
                <small>+{formatDuration(period.addedTimeSeconds)}</small>
              )}
            </span>
          </div>
          <div className="compact-match-actions" aria-label="Match controls">
            <IconButton
              className={`compact-clock-button ${
                game.clock.running ? "" : "turf-clock-action"
              }`}
              variant="default"
              size="large"
              icon={game.clock.running ? Pause : Play}
              aria-label={clockActionLabel}
              tabIndex={compactHeaderInteractive ? 0 : -1}
              onClick={() => safeChange(changeClockState)}
            />
            <IconButton
              className="compact-end-game-button"
              variant="danger"
              size="large"
              icon={Flag}
              aria-label="End game"
              tabIndex={compactHeaderInteractive ? 0 : -1}
              onClick={() => setEndConfirm(true)}
            />
          </div>
        </div>
      </div>

      {periodBoundaryReached && (
        <section
          className={`period-break-banner period-added-time-banner ${
            period.current === period.count ? "final" : ""
          }`}
          aria-label={
            period.current === period.count
              ? "Regulation time reached"
              : `${period.label} ${period.current} time reached`
          }
        >
          <span>
            <strong>
              {period.current === period.count
                ? "Regulation time reached"
                : `${period.label} ${period.current} time reached`}
            </strong>
            <small className="period-added-time-status">
              +{formatDuration(period.addedTimeSeconds)} added time · Clock{" "}
              {displayed.clock.running ? "running" : "paused"}
            </small>
            {queuedPairs.length > 0 && (
              <small className="period-break-queue-status">
                {queuedPairs.length} substitution
                {queuedPairs.length === 1 ? "" : "s"} ready
              </small>
            )}
          </span>
          <div>
            {queuedPairs.length > 0 ? (
              <Button
                className="secondary-action period-break-review-action"
                variant="default"
                size="large"
                leadingVisual={ArrowRightLeft}
                aria-label="Review substitutions"
                onClick={() => setQueuedPlanOpen(true)}
              >
                {queuedPlanErrors.length ? (
                  "Review plan"
                ) : (
                  <>
                    <span className="period-review-copy-long">
                      Review & send 'em in
                    </span>
                    <span className="period-review-copy-short">
                      Review subs
                    </span>
                  </>
                )}
              </Button>
            ) : game.benchIds.length > 0 ? (
              <Button
                className="secondary-action"
                variant="default"
                size="large"
                leadingVisual={ArrowRightLeft}
                onClick={() => setPlannerOpen(true)}
              >
                Create plan
              </Button>
            ) : null}
            <Button
              className={
                period.current === period.count
                  ? "danger-action"
                  : "primary-action"
              }
              variant={period.current === period.count ? "danger" : "primary"}
              size="large"
              leadingVisual={period.current === period.count ? Flag : Square}
              onClick={() =>
                period.current === period.count
                  ? setEndConfirm(true)
                  : safeChange(() => endCurrentPeriod(game, Date.now()))
              }
            >
              {period.current === period.count
                ? "End game"
                : `End ${period.label} ${period.current}`}
            </Button>
          </div>
        </section>
      )}

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
                : `${period.label} ${periodBreak.completedPeriod} ended`}
            </strong>
            <small>
              Ended at {formatDuration(period.matchClockSeconds)}
              {breakAddedTimeSeconds > 0
                ? ` · +${formatDuration(breakAddedTimeSeconds)} added time`
                : ""}
            </small>
            {!periodBreak.final && queuedPairs.length > 0 && (
              <small className="period-break-queue-status">
                {queuedPairs.length} substitution
                {queuedPairs.length === 1 ? "" : "s"} ready
              </small>
            )}
          </span>
          <div>
            {!periodBreak.final &&
              (queuedPairs.length > 0 ? (
                <Button
                  className="secondary-action period-break-review-action"
                  variant="default"
                  size="large"
                  leadingVisual={ArrowRightLeft}
                  aria-label="Review substitutions"
                  onClick={() => setQueuedPlanOpen(true)}
                >
                  {queuedPlanErrors.length ? (
                    "Review plan"
                  ) : (
                    <>
                      <span className="period-review-copy-long">
                        Review & send 'em in
                      </span>
                      <span className="period-review-copy-short">
                        Review subs
                      </span>
                    </>
                  )}
                </Button>
              ) : game.benchIds.length > 0 ? (
                <Button
                  className="secondary-action"
                  variant="default"
                  size="large"
                  leadingVisual={ArrowRightLeft}
                  onClick={() => setPlannerOpen(true)}
                >
                  Create plan
                </Button>
              ) : null)}
            <Button
              className={periodBreak.final ? "danger-action" : "primary-action"}
              variant={periodBreak.final ? "danger" : "primary"}
              size="large"
              leadingVisual={periodBreak.final ? Flag : Play}
              onClick={() =>
                periodBreak.final
                  ? setEndConfirm(true)
                  : safeChange(() => startNextPeriod(game, Date.now()))
              }
            >
              {periodBreak.final
                ? "End game"
                : `Start ${period.label} ${periodBreak.completedPeriod + 1}`}
            </Button>
          </div>
        </section>
      )}

      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={20} aria-hidden="true" />
          <span>{error}</span>
          <IconButton
            variant="invisible"
            icon={X}
            onClick={() => setError("")}
            aria-label="Dismiss error"
          />
        </div>
      )}
      {validationErrors.length > 0 && (
        <div className="short-side-banner">
          <CircleAlert size={19} aria-hidden="true" />
          {validationErrors.join(". ")}
        </div>
      )}
      {showSubstitutionReminder && (
        <section
          className="substitution-reminder-banner"
          role="status"
          aria-label="Substitution reminder"
        >
          <span>
            <strong>Time to consider substitutions</strong>
            <small>
              Reminder timer:{" "}
              {formatDuration(
                substitutionReminder.secondsSinceLastSubstitution,
              )}
            </small>
            {keeperPreparationNote}
          </span>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            leadingVisual={ArrowRightLeft}
            onClick={() => setPlannerOpen(true)}
          >
            Create plan
          </Button>
        </section>
      )}
      {goalkeeperPreparationWarning &&
        queuedPairs.length === 0 &&
        !showSubstitutionReminder &&
        !periodBreak &&
        !periodBoundaryReached && (
          <Banner
            className="goalkeeper-preparation-banner"
            variant="warning"
            layout="compact"
            role="status"
            aria-label="Goalkeeper preparation"
          >
            <Banner.Title as="h3">Next keeper needs preparation</Banner.Title>
            <Banner.Description>
              {goalkeeperPreparationWarning}
            </Banner.Description>
          </Banner>
        )}
      {queuedPairs.length > 0 &&
        (routineRotation.promptRecommended || queuedPlanErrors.length > 0) &&
        !periodBreak &&
        !periodBoundaryReached && (
          <section
            className={`queued-substitution-banner ${
              queuedPlanErrors.length ? "invalid" : ""
            } ${keeperPreparationNote && queuedPlanErrors.length === 0 ? "has-preparation" : ""}`}
            aria-label="Ready substitutions"
          >
            <span className="queued-substitution-copy">
              <strong>
                {queuedPairs.length} substitution
                {queuedPairs.length === 1 ? "" : "s"} ready
              </strong>
              <small>
                {queuedPlanErrors.length
                  ? "Plan needs attention before players go in"
                  : "Lineup and timers have not changed"}
              </small>
            </span>
            <span
              className="queued-substitution-timer"
              aria-label={
                !routineRotation.recommended
                  ? "No further reminders scheduled; you can still create a plan"
                  : !routineRotation.promptRecommended
                    ? "Next reminder at the period break"
                    : `Next reminder ${
                        substitutionReminder.due
                          ? "due now"
                          : `due in ${formatDuration(
                              Math.max(
                                0,
                                substitutionReminder.intervalSeconds -
                                  substitutionReminder.secondsSinceLastSubstitution,
                              ),
                            )}`
                      }`
              }
            >
              <strong>{rotationTimingLabel}</strong>
            </span>
            {queuedPlanErrors.length === 0 && keeperPreparationNote}
            <Button
              className="secondary-action queued-substitution-review"
              variant="default"
              size="large"
              leadingVisual={ArrowRightLeft}
              onClick={() => setQueuedPlanOpen(true)}
            >
              Review plan
            </Button>
          </section>
        )}

      <div className="live-layout">
        <section className="pitch-section">
          <div className="section-title">
            <div>
              <h1>On the field</h1>
              <small className="section-hint">
                Tap a player to plan a substitution, or drag them onto another
                position.
              </small>
            </div>
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
          <div className="live-pitch-frame">
            <Pitch
              pitchRef={benchDrag.pitchRef}
              benchDropTargetPositionId={
                activeBenchDrag?.compact ? null : benchDropPositionId
              }
              formation={formation}
              assignments={game.assignments}
              team={team}
              game={displayed}
              showPlayerTimes={showFieldPlayerTimes}
              onPlanSubstitution={setFieldQueuePlayerId}
              onAddGuestAtPosition={setGuestPositionId}
              onMovePlayer={(playerId, positionId) =>
                safeChange(() =>
                  movePlayer(game, playerId, positionId, Date.now()),
                )
              }
            />
          </div>
        </section>

        <aside className="bench-section">
          {game.benchIds.length > 0 && (
            <div className="rotation-status" aria-label="Next reminder">
              <span>Next reminder</span>
              <strong>{rotationTimingLabel}</strong>
            </div>
          )}
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
              <span className="roster-tab-label">
                Bench{" "}
                <span className="roster-tab-count">{game.benchIds.length}</span>
              </span>
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
              <span className="roster-tab-label">
                On field{" "}
                <span className="roster-tab-count">{fieldIds.length}</span>
              </span>
            </button>
          </div>

          <div
            id="roster-status-panel"
            className="roster-tab-panel"
            role="tabpanel"
            aria-labelledby={`roster-${rosterView}-tab`}
          >
            {rosterView === "field" ? (
              fieldIds.length ? (
                <div className="bench-list field-player-list">
                  {sortedFieldPositions.map(({ position, playerId: id }) => {
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
                        currentFieldTime={currentFieldTimes[id]}
                        aggregateFieldTime={
                          displayed.totals[id]?.fieldSeconds ?? 0
                        }
                        showCurrentFieldTime={showFieldPlayerTimes}
                        queuedIncomingName={queuedIncoming}
                        canQueue={game.benchIds.length > 0}
                        onQueue={() => setFieldQueuePlayerId(id)}
                        onChangePosition={() => setPositionEditorPlayerId(id)}
                        onUnavailable={() => setUnavailableConfirmPlayerId(id)}
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
              <>
                {showBenchSinceStartCohort && (
                  <div
                    className="cohort-time-summary"
                    aria-label="Shared bench time"
                  >
                    <span>
                      {benchSinceStartCount === game.benchIds.length
                        ? `All ${benchSinceStartCount}`
                        : `${benchSinceStartCount} of ${game.benchIds.length}`}{" "}
                      sitting since start
                    </span>
                    <strong>
                      {formatDuration(displayed.clock.elapsedSeconds)}
                    </strong>
                  </div>
                )}
                <div className="bench-list">
                  {sortedBenchIds.map((id) => {
                    const queuedPair = queuedPairs.find(
                      (pair) => pair.inPlayerId === id,
                    );
                    const queuedPosition = formation.positions.find(
                      (position) => position.id === queuedPair?.positionId,
                    );
                    const playedSeconds =
                      displayed.totals[id]?.fieldSeconds ?? 0;
                    const paceWarning = getPlayingTimePaceWarning(
                      displayed,
                      id,
                    );
                    return (
                      <PlayerTimeRow
                        key={id}
                        player={team.roster.find((player) => player.id === id)!}
                        dragBindings={benchDrag.bindings(id)}
                        dragging={activeBenchDrag?.playerId === id}
                        goalCount={playerGoalCount(displayed, id)}
                        currentBenchTime={benchTimes[id]}
                        showCurrentBenchTime={
                          !showBenchSinceStartCohort ||
                          benchTimes[id] !== displayed.clock.elapsedSeconds
                        }
                        playedTime={playedSeconds}
                        aggregateBenchTime={
                          displayed.totals[id]?.benchSeconds ?? 0
                        }
                        paceWarning={paceWarning}
                        queuedPositionLabel={queuedPosition?.shortLabel}
                        queuedOutgoingPlayerName={
                          queuedPair
                            ? playerName(team, queuedPair.outPlayerId)
                            : undefined
                        }
                        onQueue={() => setBenchQueuePlayerId(id)}
                        onUnavailable={() => setUnavailableConfirmPlayerId(id)}
                      />
                    );
                  })}
                  <AddGuestBenchRow onClick={() => setGuestBenchOpen(true)} />
                </div>
              </>
            ) : (
              <div className="bench-list">
                <div className="bench-empty">
                  <strong>No available substitutes</strong>
                  <span>
                    Position changes are still available. Tiny legs, big
                    minutes.
                  </span>
                </div>
                <AddGuestBenchRow onClick={() => setGuestBenchOpen(true)} />
              </div>
            )}
          </div>

          {game.unavailableIds.length > 0 && (
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
                      <Button
                        className="secondary-action"
                        variant="default"
                        size="large"
                        aria-label={`Add ${playerName(team, id)} to game`}
                        onClick={() => handleAvailable(id)}
                      >
                        Add to game
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </aside>
      </div>

      <GameLog
        game={game}
        formation={formation}
        team={team}
        followsRoster={game.unavailableIds.length === 0}
      />

      <div className="mobile-control-dock" aria-label="Game controls">
        <Button
          className="undo-button"
          variant="invisible"
          size="large"
          block
          labelWrap
          leadingVisual={RotateCcw}
          disabled={game.history.length === 0}
          onClick={() => safeChange(() => undoLastEvent(game))}
          aria-label="Undo last change"
        >
          Undo
        </Button>
        <Button
          className={`sub-button ${queuedPairs.length ? "queued" : ""}`}
          variant="invisible"
          size="large"
          block
          leadingVisual={ArrowRightLeft}
          aria-label={queuedPairs.length ? "Review substitutions" : undefined}
          disabled={game.benchIds.length === 0 && queuedPairs.length === 0}
          onClick={() =>
            queuedPairs.length ? setQueuedPlanOpen(true) : setPlannerOpen(true)
          }
        >
          {queuedPairs.length ? "Review" : "Create plan"}
        </Button>
        <Button
          className="score-button"
          variant="invisible"
          size="large"
          block
          labelWrap
          leadingVisual={SoccerBallIcon}
          aria-label="Record a goal"
          disabled={!displayed.clock.running}
          onClick={() => setGoalScorerOpen(true)}
        >
          Goal
        </Button>
      </div>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {benchDrag.message}
      </span>
      {activeBenchDrag && draggedBenchPlayer && (
        <>
          <LiveBenchDropPitch
            compact={activeBenchDrag.compact}
            formation={formation}
            assignments={game.assignments}
            players={team.roster}
            incoming={draggedBenchPlayer}
            targetPositionId={activeBenchDrag.targetPositionId}
            pitchRef={benchDrag.compactPitchRef}
            fieldRef={benchDrag.pitchRef}
            warning={benchDropNotice?.message}
          />
          <PlayerDragPreview
            name={draggedBenchPlayer.name}
            x={activeBenchDrag.x}
            y={activeBenchDrag.y}
          />
        </>
      )}
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
          onRemove={(pair) => {
            if (
              safeChange(() =>
                removeQueuedSubstitution(game, pair.inPlayerId),
              ) &&
              queuedPairs.length === 1
            ) {
              setQueuedPlanOpen(false);
            }
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
      {guestBenchOpen && (
        <GuestPlayerSheet
          onClose={() => setGuestBenchOpen(false)}
          onAdd={(name, number) => {
            const guest = buildGuestPlayer(
              team.id,
              name,
              number,
              (game.guestPlayers?.length ?? 0) + 1,
            );
            if (
              safeChange(() =>
                addGuestPlayerToBench(game, guest, team.sideSize, Date.now()),
              )
            ) {
              setGuestBenchOpen(false);
              setRosterView("bench");
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
          onSendImmediately={(outPlayerId) =>
            sendSingleSubstitution(benchQueuePlayerId, outPlayerId)
          }
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
          onSendImmediately={(inPlayerId) =>
            sendSingleSubstitution(inPlayerId, fieldQueuePlayerId)
          }
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
      {unavailableConfirmPlayerId && (
        <ConfirmSheet
          title={`Take ${playerName(team, unavailableConfirmPlayerId)} out of game?`}
          body={
            Object.values(game.assignments).includes(unavailableConfirmPlayerId)
              ? `${playerName(team, unavailableConfirmPlayerId)} will be marked unavailable. Sideline will choose the fairest available bench replacement and show you the change before play continues.`
              : `${playerName(team, unavailableConfirmPlayerId)} will be removed from the bench and marked unavailable. You can add them back from Out of game.`
          }
          cancelLabel="Keep player"
          confirmLabel="Remove player"
          confirmIcon={<UserRoundX size={18} aria-hidden="true" />}
          onCancel={() => setUnavailableConfirmPlayerId(null)}
          onConfirm={() => {
            if (handleUnavailable(unavailableConfirmPlayerId)) {
              setUnavailableConfirmPlayerId(null);
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
          description={
            game.history.at(-1)?.type === "substitution"
              ? game.history.at(-1)?.note
              : undefined
          }
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
      {demoClockOpen && (
        <DemoClockDialog
          game={game}
          onChange={onChange}
          onClose={() => setDemoClockOpen(false)}
        />
      )}
      {endConfirm && (
        <ConfirmSheet
          title="End this game?"
          body={`The clock will stop and you’ll see the game summary before ${
            summaryReturnLabel === "Prep for next game"
              ? `preparing for the next ${team.name} game.`
              : "returning to team selection."
          }`}
          cancelLabel="Continue game"
          confirmLabel="End game"
          confirmIcon={<Flag size={18} aria-hidden="true" />}
          showClose
          onCancel={() => setEndConfirm(false)}
          onConfirm={() => {
            const finalGame = cancelQueuedSubstitutions(
              finalizeGame(game, Date.now()),
            );
            setEndConfirm(false);
            onEnd(finalGame);
          }}
        />
      )}
    </div>
  );
}

function Pitch({
  pitchRef,
  benchDropTargetPositionId,
  formation,
  assignments,
  team,
  game,
  showPlayerTimes,
  onPlanSubstitution,
  onAddGuestAtPosition,
  onMovePlayer,
}: {
  pitchRef: RefObject<HTMLDivElement | null>;
  benchDropTargetPositionId?: string | null;
  formation: ReturnType<typeof getFormation>;
  assignments: Record<string, string>;
  team: Team;
  game: ActiveGame;
  showPlayerTimes: boolean;
  onPlanSubstitution: (playerId: string) => void;
  onAddGuestAtPosition: (positionId: string) => void;
  onMovePlayer: (playerId: string, positionId: string) => void;
}) {
  const dragRef = useRef<{
    playerId: string;
    pointerId: number;
    sourcePositionId: string;
    targetPositionId: string | null;
    startX: number;
    startY: number;
    x: number;
    y: number;
    dragging: boolean;
    waitingForHold: boolean;
  } | null>(null);
  const [dragState, setDragState] = useState(dragRef.current);
  const [swapFeedback, setSwapFeedback] = useState<{
    positionIds: string[];
    playerIds: string[];
    message: string;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  const cancelDrag = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    dragRef.current = null;
    setDragState(null);
  }, []);

  useEffect(() => {
    const pitch = pitchRef.current;
    const preventDragScroll = (event: TouchEvent) => {
      if (dragRef.current?.dragging && event.cancelable) event.preventDefault();
    };
    const preventContextMenu = (event: Event) => {
      if (dragRef.current) event.preventDefault();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
    };
    pitch?.addEventListener("touchmove", preventDragScroll, { passive: false });
    pitch?.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("keydown", escape);
    return () => {
      if (holdTimerRef.current !== null)
        window.clearTimeout(holdTimerRef.current);
      pitch?.removeEventListener("touchmove", preventDragScroll);
      pitch?.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("blur", cancelDrag);
      window.removeEventListener("keydown", escape);
    };
  }, [cancelDrag, pitchRef]);

  const findDropTargetPositionId = (
    clientX: number,
    clientY: number,
    sourcePositionId: string,
  ) =>
    Array.from(
      pitchRef.current?.querySelectorAll<HTMLElement>(
        ".pitch-player[data-position-id]",
      ) ?? [],
    ).find((element) => {
      if (element.dataset.positionId === sourcePositionId) return false;
      const bounds = element.getBoundingClientRect();
      return (
        bounds.width > 0 &&
        bounds.height > 0 &&
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom
      );
    })?.dataset.positionId ?? null;

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    },
    [],
  );

  const updateDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    playerId: string,
    sourcePositionId: string,
  ) => {
    const drag = dragRef.current;
    if (
      !drag ||
      drag.playerId !== playerId ||
      drag.pointerId !== event.pointerId
    )
      return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const dragging = drag.dragging || Math.hypot(deltaX, deltaY) > 8;
    if (!dragging) return;
    if (drag.waitingForHold) {
      cancelDrag();
      return;
    }

    const targetPositionId = findDropTargetPositionId(
      event.clientX,
      event.clientY,
      sourcePositionId,
    );

    const nextDrag = {
      ...drag,
      targetPositionId,
      x: event.clientX,
      y: event.clientY,
      dragging: true,
    };
    dragRef.current = nextDrag;
    setDragState(nextDrag);
    event.preventDefault();
  };

  const finishDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    canceled = false,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (drag?.dragging) {
      event.preventDefault();
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const targetPositionId = canceled
        ? null
        : findDropTargetPositionId(
            event.clientX,
            event.clientY,
            drag.sourcePositionId,
          );
      if (targetPositionId) {
        const targetPlayerId = assignments[targetPositionId];
        const sourcePlayerName = playerName(team, drag.playerId);
        const targetPosition = formation.positions.find(
          (position) => position.id === targetPositionId,
        );
        const message = targetPlayerId
          ? `${sourcePlayerName} and ${playerName(team, targetPlayerId)} swapped`
          : `${sourcePlayerName} moved to ${targetPosition?.label ?? "new position"}`;

        if (feedbackTimerRef.current !== null) {
          window.clearTimeout(feedbackTimerRef.current);
        }
        setSwapFeedback({
          positionIds: [drag.sourcePositionId, targetPositionId],
          playerIds: [
            drag.playerId,
            ...(targetPlayerId ? [targetPlayerId] : []),
          ],
          message,
        });
        feedbackTimerRef.current = window.setTimeout(() => {
          setSwapFeedback(null);
          feedbackTimerRef.current = null;
        }, 1_300);
        onMovePlayer(drag.playerId, targetPositionId);
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
      {swapFeedback && (
        <div
          className="pitch-drag-confirmation"
          role="status"
          aria-live="polite"
        >
          <Check size={16} aria-hidden="true" />
          <span>{swapFeedback.message}</span>
        </div>
      )}
      {formation.positions.map((position) => {
        const playerId = assignments[position.id];
        const player = team.roster.find((item) => item.id === playerId);
        const currentPlayingSeconds = player
          ? getCurrentFieldSeconds(game, player.id)
          : 0;
        const plannedPair = player
          ? game.queuedSubstitutions?.find(
              (pair) => pair.outPlayerId === player.id,
            )
          : undefined;
        const plannedIncomingName = plannedPair
          ? playerName(team, plannedPair.inPlayerId)
          : null;
        const content = (
          <>
            {player ? (
              <span className="pitch-position-meta">
                <span className="position-label">{position.shortLabel}</span>
              </span>
            ) : (
              <span className="position-label">{position.shortLabel}</span>
            )}
            {plannedIncomingName && (
              <ArrowRightLeft
                className="pitch-plan-icon"
                size={13}
                aria-hidden="true"
              />
            )}
            {player ? (
              <span className="pitch-player-name">
                <GoalMarkedPlayerName
                  label={player.name}
                  goalCount={playerGoalCount(game, player.id)}
                />
              </span>
            ) : (
              <strong>Open</strong>
            )}
            {player ? (
              showPlayerTimes && (
                <small>
                  <span className="pitch-time">
                    {formatPlayerDuration(currentPlayingSeconds)}
                  </span>
                  <span className="pitch-time-label"> playing</span>
                </small>
              )
            ) : (
              <small>{position.label}</small>
            )}
          </>
        );
        const style = {
          left: `${position.x}%`,
          top: `${position.y}%`,
        };
        const swapConfirmed =
          swapFeedback?.playerIds.includes(playerId) ||
          swapFeedback?.positionIds.includes(position.id);

        return player ? (
          <button
            type="button"
            className={`pitch-player ${
              dragState?.sourcePositionId === position.id && dragState.dragging
                ? "dragging"
                : ""
            } ${
              dragState?.targetPositionId === position.id ||
              benchDropTargetPositionId === position.id
                ? "drop-target"
                : ""
            } ${swapConfirmed ? "swap-confirmed" : ""}`}
            key={position.id}
            style={style}
            data-position-id={position.id}
            aria-label={`Plan substitution for ${player.name}${
              plannedIncomingName
                ? `. Scheduled out for ${plannedIncomingName}`
                : ""
            }`}
            title={
              plannedIncomingName
                ? `Scheduled out for ${plannedIncomingName}. Tap to edit the substitution or drag to another position`
                : "Tap to plan a substitution or drag to another position"
            }
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                event.isPrimary === false ||
                dragRef.current
              )
                return;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              const nextDrag = {
                playerId: player.id,
                pointerId: event.pointerId,
                sourcePositionId: position.id,
                targetPositionId: null,
                startX: event.clientX,
                startY: event.clientY,
                x: event.clientX,
                y: event.clientY,
                dragging: false,
                waitingForHold: event.pointerType === "touch",
              };
              dragRef.current = nextDrag;
              setDragState(nextDrag);
              if (nextDrag.waitingForHold) {
                holdTimerRef.current = window.setTimeout(() => {
                  holdTimerRef.current = null;
                  const current = dragRef.current;
                  if (!current) return;
                  const active = {
                    ...current,
                    dragging: true,
                    waitingForHold: false,
                  };
                  dragRef.current = active;
                  setDragState(active);
                }, TOUCH_DRAG_HOLD_MS);
              }
            }}
            onPointerMove={(event) => updateDrag(event, player.id, position.id)}
            onPointerUp={finishDrag}
            onPointerCancel={(event) => finishDrag(event, true)}
            onLostPointerCapture={(event) => finishDrag(event, true)}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                suppressClickRef.current = false;
                return;
              }
              onPlanSubstitution(player.id);
            }}
          >
            {content}
            {swapConfirmed && (
              <span className="pitch-swap-confirmation-mark" aria-hidden="true">
                <Check size={14} />
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className={`pitch-player empty ${
              swapFeedback?.positionIds.includes(position.id)
                ? "swap-confirmed"
                : ""
            }`}
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
      {dragState?.dragging && (
        <PlayerDragPreview
          name={playerName(team, dragState.playerId)}
          x={dragState.x}
          y={dragState.y}
        />
      )}
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
  const currentPlayer = presentPlayers.find(
    (player) => player.id === currentPlayerId,
  );
  const advice = getStarterLineupAdvice(formation, assignments, presentPlayers);
  const issues = advice.issuesByPosition[positionId] ?? [];
  const choices = presentPlayers
    .filter((player) => player.id !== currentPlayerId)
    .sort((a, b) =>
      position
        ? compareStarterPlayersByPreference(a, b, position.role)
        : a.name.localeCompare(b.name),
    );

  return (
    <SidelineDialog
      title={`Choose ${position?.label ?? "position"}`}
      description="Choose a bench player to replace this starter, or another starter to swap positions."
      className="compact-sheet starter-picker"
      onClose={onClose}
      footer={
        <>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            onClick={onClose}
          >
            Cancel
          </Button>
          {currentPlayerId && (
            <Button
              className="quiet-button"
              variant="invisible"
              size="large"
              onClick={onClear}
            >
              Leave open
            </Button>
          )}
        </>
      }
    >
      {issues.length > 0 && (
        <Banner
          className="starter-current-notes"
          variant="warning"
          layout="compact"
          role="status"
          aria-label="Current starter concerns"
        >
          <Banner.Title as="h3">
            {currentPlayer
              ? `${currentPlayer.name} at ${position?.label}`
              : position?.label}
          </Banner.Title>
          <Banner.Description>{issues.join(" ")}</Banner.Description>
        </Banner>
      )}
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
              aria-label={`${player.name} Prefers ${player.preferredRoles.map(preferredRoleLabel).join(" · ")} Currently ${assignedLabel ?? "on starting bench"}`}
              onClick={() => onSelect(player.id)}
            >
              <span className="starter-choice-player">
                <strong>{player.name}</strong>
                <span className="starter-preferences">
                  <small>Prefers</small>
                  <span>
                    {player.preferredRoles.map(preferredRoleLabel).join(" · ")}
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
    </SidelineDialog>
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
  const description = `${team.name} ${score.us} – ${score.opponent} Opponent`;
  const formation = getFormation(game.formationId);

  return (
    <SidelineDialog
      title="Record a goal"
      description={description}
      className="compact-sheet scorekeeper-sheet"
      onClose={onClose}
      footerClassName="scorekeeper-footer"
      footer={
        <Button
          className="secondary-action opponent-goal-action"
          variant="default"
          size="large"
          leadingVisual={SoccerBallIcon}
          onClick={onOpponentGoal}
        >
          Opponent scored
        </Button>
      }
    >
      <h3>Who scored for us?</h3>
      <div className="goal-scorer-grid">
        {playerIds.map((playerId) => {
          const positionId = Object.entries(game.assignments).find(
            ([, assignedPlayerId]) => assignedPlayerId === playerId,
          )?.[0];
          const position = formation.positions.find(
            (candidate) => candidate.id === positionId,
          );
          return (
            <Button
              className="secondary-action"
              variant="default"
              size="large"
              key={playerId}
              aria-label={`Record goal for ${playerLabel(team, playerId)} at ${
                position?.label ?? "unknown position"
              }`}
              onClick={() => onSelect(playerId)}
            >
              <GoalMarkedPlayerName
                label={playerName(team, playerId)}
                number={
                  team.roster.find((player) => player.id === playerId)?.number
                }
                goalCount={playerGoalCount(game, playerId)}
                emphasized={false}
                compact
              />
              <Label
                className="goal-scorer-position"
                variant="secondary"
                aria-hidden="true"
              >
                {position?.shortLabel ?? "—"}
              </Label>
            </Button>
          );
        })}
      </div>
    </SidelineDialog>
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
  const description = `${team.name} · ${score} ${
    score === 1 ? "goal" : "goals"
  }`;

  return (
    <SidelineDialog
      title="Our goals"
      description={description}
      className="compact-sheet goal-summary-sheet"
      onClose={onClose}
    >
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
    </SidelineDialog>
  );
}

function PlayerContextPanel({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    emphasis?: "warm";
    wide?: boolean;
    action?: ReactNode;
  }>;
}) {
  return (
    <Card
      className="player-context-panel"
      padding="condensed"
      borderRadius="medium"
    >
      <dl className="player-context-grid">
        {items.map((item) => (
          <div
            className={`player-context-item ${item.wide ? "wide" : ""} ${item.action ? "has-action" : ""}`}
            key={item.label}
          >
            <dt>{item.label}</dt>
            <dd className={item.emphasis === "warm" ? "warm" : undefined}>
              {item.value}
              {item.action && (
                <span className="player-context-item-action">
                  {item.action}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RemoveFromPlanAction({ onRemove }: { onRemove: () => void }) {
  return (
    <IconButton
      className="icon-button remove-from-plan-action"
      variant="invisible"
      size="medium"
      icon={Trash2}
      aria-label="Remove from plan"
      tooltipDirection="nw"
      onClick={onRemove}
    />
  );
}

function SingleSubstitutionActions({
  game,
  team,
  pair,
  canPlan,
  onPlan,
  onSendImmediately,
  editing,
}: {
  game: ActiveGame;
  team: Team;
  pair?: SubstitutionPair;
  canPlan: boolean;
  onPlan: () => void;
  onSendImmediately: () => void;
  editing: boolean;
}) {
  const noticeId = useId();
  const notice = getKeeperChangeNotice(game, team, pair ? [pair] : [], "now", {
    warnAboutRest: false,
  });
  return (
    <div className="single-substitution-actions">
      <KeeperChangeNotice notice={notice} id={noticeId} />
      <div className="bench-picker-actions">
        <Button
          className="secondary-action"
          variant="default"
          size="large"
          leadingVisual={ArrowRightLeft}
          disabled={!pair}
          aria-describedby={notice ? noticeId : undefined}
          onClick={onSendImmediately}
        >
          Sub now
        </Button>
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          leadingVisual={Check}
          disabled={!canPlan}
          onClick={onPlan}
        >
          {editing ? "Update plan" : "Add to plan"}
        </Button>
      </div>
    </div>
  );
}

function ScheduledChoicesHeader({ direction }: { direction: "in" | "out" }) {
  return (
    <div className="scheduled-choices-header">
      <h3 className="scheduled-choices-heading">
        {direction === "in" ? "Already going in" : "Already going out"}
      </h3>
      <p className="scheduled-choices-description">
        Replaces existing pairings.
      </p>
    </div>
  );
}

function PlannedPairingImpact({
  game,
  team,
  inPlayerId,
  outPlayerId,
}: {
  game: ActiveGame;
  team: Team;
  inPlayerId: string;
  outPlayerId: string;
}) {
  const { removedPlayerIds } = previewBenchSubstitution(
    game,
    inPlayerId,
    outPlayerId,
  );
  if (!removedPlayerIds.length) return null;
  const listFormatter = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  });
  const fieldIds = new Set(Object.values(game.assignments));
  const fieldNames = removedPlayerIds
    .filter((id) => fieldIds.has(id))
    .map((id) => playerName(team, id));
  const benchNames = removedPlayerIds
    .filter((id) => game.benchIds.includes(id))
    .map((id) => playerName(team, id));
  const outcomes = [
    ...(fieldNames.length
      ? [`${listFormatter.format(fieldNames)} on the field`]
      : []),
    ...(benchNames.length
      ? [`${listFormatter.format(benchNames)} on the bench`]
      : []),
  ];
  return (
    <span className="planned-pairing-impact" role="status">
      This leaves {outcomes.join(" and ")}.
    </span>
  );
}

function BenchSubstitutionPicker({
  playerId,
  game,
  team,
  onClose,
  onSelect,
  onSendImmediately,
  onRemove,
}: {
  playerId: string;
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onSelect: (outPlayerId: string) => void;
  onSendImmediately: (outPlayerId: string) => void;
  onRemove: () => void;
}) {
  const currentPair = game.queuedSubstitutions?.find(
    (pair) => pair.inPlayerId === playerId,
  );
  const [selectedOutPlayerId, setSelectedOutPlayerId] = useState(
    currentPair?.outPlayerId ?? "",
  );
  const player = team.roster.find((item) => item.id === playerId);
  if (!player) return null;
  const formation = getFormation(game.formationId);
  const planningGame = getSubstitutionPlanningSnapshot(game);
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const rotationIntervalSeconds =
    getSubstitutionReminderStatus(game).intervalSeconds;
  const selectedPositionEntry = Object.entries(game.assignments).find(
    ([, outPlayerId]) => outPlayerId === selectedOutPlayerId,
  );
  const selectedPosition = selectedPositionEntry
    ? formation.positions.find(
        (position) => position.id === selectedPositionEntry[0],
      )
    : null;
  const choices = Object.entries(game.assignments)
    .map(([positionId, outPlayerId], formationIndex) => {
      const position = formation.positions.find(
        (item) => item.id === positionId,
      )!;
      const preferenceIndex = player.preferredRoles.indexOf(position.role);
      const plannedPair = game.queuedSubstitutions
        ?.filter((pair) => pair.inPlayerId !== playerId)
        .find((pair) => pair.outPlayerId === outPlayerId);
      return {
        position,
        outPlayerId,
        formationIndex,
        alreadyPlanned: Boolean(plannedPair),
        preferenceIndex:
          preferenceIndex === -1 ? Number.POSITIVE_INFINITY : preferenceIndex,
        currentFieldSeconds: getCurrentFieldSeconds(planningGame, outPlayerId),
        totalFieldSeconds: game.totals[outPlayerId]?.fieldSeconds ?? 0,
        timeBandSeconds,
        rotationIntervalSeconds,
        plannedIncomingName: plannedPair
          ? playerName(team, plannedPair.inPlayerId)
          : undefined,
      };
    })
    .sort(compareSubstitutionDestinations);

  return (
    <SidelineDialog
      title={playerDialogTitle(team, playerId, "Plan in")}
      description={`Who's ${player.name} going in for?`}
      className="compact-sheet bench-substitution-sheet"
      onClose={onClose}
      footer={
        <SingleSubstitutionActions
          game={game}
          team={team}
          pair={
            selectedPosition
              ? {
                  inPlayerId: playerId,
                  outPlayerId: selectedOutPlayerId,
                  positionId: selectedPosition.id,
                }
              : undefined
          }
          canPlan={Boolean(
            selectedOutPlayerId &&
            selectedOutPlayerId !== currentPair?.outPlayerId,
          )}
          onPlan={() => onSelect(selectedOutPlayerId)}
          onSendImmediately={() => onSendImmediately(selectedOutPlayerId)}
          editing={Boolean(currentPair)}
        />
      }
      footerClassName="bench-picker-footer"
    >
      <PlayerContextPanel
        items={[
          {
            label: "Positions",
            value: player.preferredRoles.map(preferredRoleLabel).join(" · "),
          },
          {
            label: "Played",
            value: formatPlayerDuration(
              game.totals[playerId]?.fieldSeconds ?? 0,
              "Not played yet",
            ),
          },
          {
            label: "Sitting now",
            value: formatPlayerDuration(getCurrentBenchSeconds(game, playerId)),
          },
          {
            label: "Goals",
            value: (
              <PlayerGoalSummary
                label={player.name}
                goalCount={playerGoalCount(game, playerId)}
              />
            ),
          },
          ...(selectedOutPlayerId
            ? [
                {
                  label: "In this plan",
                  value: (
                    <>
                      Scheduled in at{" "}
                      {selectedPosition?.mediumLabel ??
                        selectedPositionEntry?.[0]}{" "}
                      for {playerName(team, selectedOutPlayerId)}
                      {selectedPosition && (
                        <PlannedPairingImpact
                          game={game}
                          team={team}
                          inPlayerId={playerId}
                          outPlayerId={selectedOutPlayerId}
                        />
                      )}
                    </>
                  ),
                  wide: true,
                  action: currentPair ? (
                    <RemoveFromPlanAction onRemove={onRemove} />
                  ) : undefined,
                },
              ]
            : []),
        ]}
      />

      <div className="bench-replacement-list">
        {choices.map(
          (
            { position, outPlayerId, preferenceIndex, plannedIncomingName },
            index,
          ) => {
            const selected = selectedOutPlayerId === outPlayerId;
            return (
              <Fragment key={outPlayerId}>
                {plannedIncomingName &&
                  !choices[index - 1]?.plannedIncomingName && (
                    <ScheduledChoicesHeader direction="out" />
                  )}
                <button
                  className={`bench-position-choice ${
                    selected ? "selected" : ""
                  }`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedOutPlayerId(outPlayerId)}
                >
                  <span className="replacement-player-summary">
                    <GoalMarkedPlayerName
                      label={playerName(team, outPlayerId)}
                      number={
                        team.roster.find((player) => player.id === outPlayerId)
                          ?.number
                      }
                      goalCount={playerGoalCount(game, outPlayerId)}
                    />
                  </span>
                  <span className={preferenceFitClassName(preferenceIndex)}>
                    {selected && (
                      <Check
                        className="replacement-selected-icon"
                        size={15}
                        aria-hidden="true"
                      />
                    )}
                    <span>{preferenceFitLabel(preferenceIndex)}</span>
                  </span>
                  <span className="replacement-player-position">
                    {position.label}
                  </span>
                  <span className="replacement-player-times">
                    <span>
                      <span>Playing</span>
                      <strong>
                        {formatPlayerDuration(
                          getCurrentFieldSeconds(game, outPlayerId),
                        )}
                      </strong>
                    </span>
                    <span>
                      <span>Total</span>
                      <strong>
                        {formatPlayerDuration(
                          game.totals[outPlayerId]?.fieldSeconds ?? 0,
                          "Not played yet",
                        )}
                      </strong>
                    </span>
                  </span>
                  {plannedIncomingName && (
                    <span className="replacement-player-status outgoing-status">
                      <ArrowRightLeft size={13} aria-hidden="true" />
                      Scheduled out for {plannedIncomingName}
                    </span>
                  )}
                </button>
              </Fragment>
            );
          },
        )}
      </div>
    </SidelineDialog>
  );
}

function FieldSubstitutionPicker({
  playerId,
  game,
  team,
  onClose,
  onSelect,
  onSendImmediately,
  onRemove,
}: {
  playerId: string;
  game: ActiveGame;
  team: Team;
  onClose: () => void;
  onSelect: (inPlayerId: string) => void;
  onSendImmediately: (inPlayerId: string) => void;
  onRemove: () => void;
}) {
  const currentPair = game.queuedSubstitutions?.find(
    (pair) => pair.outPlayerId === playerId,
  );
  const [selectedInPlayerId, setSelectedInPlayerId] = useState(
    currentPair?.inPlayerId ?? "",
  );
  const player = team.roster.find((item) => item.id === playerId);
  if (!player) return null;
  const formation = getFormation(game.formationId);
  const planningGame = getSubstitutionPlanningSnapshot(game);
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const positionEntry = Object.entries(game.assignments).find(
    ([, assignedPlayerId]) => assignedPlayerId === playerId,
  );
  if (!positionEntry) return null;
  const position = formation.positions.find(
    (item) => item.id === positionEntry[0],
  )!;
  const choices = game.benchIds
    .map((inPlayerId) => {
      const incoming = team.roster.find((item) => item.id === inPlayerId)!;
      const preferenceIndex = incoming.preferredRoles.indexOf(position.role);
      const plannedPair = game.queuedSubstitutions
        ?.filter((pair) => pair.outPlayerId !== playerId)
        .find((pair) => pair.inPlayerId === inPlayerId);
      return {
        player: incoming,
        preferenceIndex:
          preferenceIndex === -1 ? Number.POSITIVE_INFINITY : preferenceIndex,
        plannedOutgoingName: plannedPair
          ? playerName(team, plannedPair.outPlayerId)
          : undefined,
      };
    })
    .sort((a, b) => {
      const toBand = (seconds: number) =>
        Math.floor(Math.max(0, seconds) / timeBandSeconds) * timeBandSeconds;
      const playerAFieldSeconds = game.totals[a.player.id]?.fieldSeconds ?? 0;
      const playerBFieldSeconds = game.totals[b.player.id]?.fieldSeconds ?? 0;
      const playerABenchSeconds = getCurrentBenchSeconds(
        planningGame,
        a.player.id,
      );
      const playerBBenchSeconds = getCurrentBenchSeconds(
        planningGame,
        b.player.id,
      );
      return (
        Number(Boolean(a.plannedOutgoingName)) -
          Number(Boolean(b.plannedOutgoingName)) ||
        toBand(playerAFieldSeconds) - toBand(playerBFieldSeconds) ||
        toBand(playerBBenchSeconds) - toBand(playerABenchSeconds) ||
        playerAFieldSeconds - playerBFieldSeconds ||
        playerBBenchSeconds - playerABenchSeconds ||
        a.preferenceIndex - b.preferenceIndex ||
        a.player.name.localeCompare(b.player.name)
      );
    });

  return (
    <SidelineDialog
      title={playerDialogTitle(team, playerId, "Plan out")}
      description={`Who's coming on from the bench at ${position.label}?`}
      className="compact-sheet bench-substitution-sheet"
      onClose={onClose}
      footer={
        <SingleSubstitutionActions
          game={game}
          team={team}
          pair={
            selectedInPlayerId
              ? {
                  inPlayerId: selectedInPlayerId,
                  outPlayerId: playerId,
                  positionId: position.id,
                }
              : undefined
          }
          canPlan={Boolean(
            selectedInPlayerId &&
            selectedInPlayerId !== currentPair?.inPlayerId,
          )}
          onPlan={() => onSelect(selectedInPlayerId)}
          onSendImmediately={() => onSendImmediately(selectedInPlayerId)}
          editing={Boolean(currentPair)}
        />
      }
      footerClassName="bench-picker-footer"
    >
      <PlayerContextPanel
        items={[
          {
            label: "Current Position",
            value: position.label,
          },
          {
            label: "Played",
            value: formatPlayerDuration(
              game.totals[playerId]?.fieldSeconds ?? 0,
              "Not played yet",
            ),
          },
          {
            label: "Playing now",
            value: formatPlayerDuration(getCurrentFieldSeconds(game, playerId)),
          },
          {
            label: "Goals",
            value: (
              <PlayerGoalSummary
                label={playerName(team, playerId)}
                goalCount={playerGoalCount(game, playerId)}
              />
            ),
          },
          ...(selectedInPlayerId
            ? [
                {
                  label: "In this plan",
                  value: (
                    <>
                      Scheduled out for {playerName(team, selectedInPlayerId)}
                      <PlannedPairingImpact
                        game={game}
                        team={team}
                        inPlayerId={selectedInPlayerId}
                        outPlayerId={playerId}
                      />
                    </>
                  ),
                  wide: true,
                  action: currentPair ? (
                    <RemoveFromPlanAction onRemove={onRemove} />
                  ) : undefined,
                },
              ]
            : []),
        ]}
      />

      <div className="bench-replacement-list">
        {choices.length === 0 && (
          <p className="empty-copy">
            No bench players available. Add or return a player to make a
            substitution.
          </p>
        )}
        {choices.map(
          (
            { player: incoming, preferenceIndex, plannedOutgoingName },
            index,
          ) => {
            const selected = selectedInPlayerId === incoming.id;
            return (
              <Fragment key={incoming.id}>
                {plannedOutgoingName &&
                  !choices[index - 1]?.plannedOutgoingName && (
                    <ScheduledChoicesHeader direction="in" />
                  )}
                <button
                  className={selected ? "selected" : ""}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedInPlayerId(incoming.id)}
                >
                  <span className="replacement-player-summary">
                    <GoalMarkedPlayerName
                      label={incoming.name}
                      number={incoming.number}
                      goalCount={playerGoalCount(game, incoming.id)}
                    />
                  </span>
                  <span className={preferenceFitClassName(preferenceIndex)}>
                    {selected && (
                      <Check
                        className="replacement-selected-icon"
                        size={15}
                        aria-hidden="true"
                      />
                    )}
                    <span>{preferenceFitLabel(preferenceIndex)}</span>
                  </span>
                  <span
                    className="replacement-player-preferences"
                    aria-label={`Preferred roles: ${incoming.preferredRoles
                      .map(preferredRoleLabel)
                      .join(" and ")}`}
                  >
                    <span>Prefers</span>
                    <strong>
                      {compactPreferredRolesLabel(incoming.preferredRoles)}
                    </strong>
                  </span>
                  <span className="replacement-player-times">
                    <span>
                      <span>Bench</span>
                      <strong>
                        {formatPlayerDuration(
                          getCurrentBenchSeconds(game, incoming.id),
                        )}
                      </strong>
                    </span>
                    <span>
                      <span>Played</span>
                      <strong>
                        {formatPlayerDuration(
                          game.totals[incoming.id]?.fieldSeconds ?? 0,
                          "Not played yet",
                        )}
                      </strong>
                    </span>
                  </span>
                  {plannedOutgoingName && (
                    <span className="replacement-player-status incoming-status">
                      <ArrowRightLeft size={13} aria-hidden="true" />
                      Scheduled in for {plannedOutgoingName}
                    </span>
                  )}
                </button>
              </Fragment>
            );
          },
        )}
      </div>
    </SidelineDialog>
  );
}

function AddGuestBenchRow({ onClick }: { onClick: () => void }) {
  return (
    <Button
      className="live-guest-add-row"
      variant="invisible"
      size="large"
      block
      onClick={onClick}
      aria-label="Add guest player to bench"
    >
      <span className="player-number guest-add-placeholder" aria-hidden="true">
        <Plus size={18} />
      </span>
      <span className="guest-add-copy">
        <strong>New player</strong>
        <small>Add to bench</small>
      </span>
    </Button>
  );
}

function FieldPlayerTimeRow({
  player,
  goalCount,
  positionLabel,
  currentFieldTime,
  aggregateFieldTime,
  showCurrentFieldTime,
  queuedIncomingName,
  canQueue,
  onQueue,
  onChangePosition,
  onUnavailable,
}: {
  player: Player;
  goalCount: number;
  positionLabel: string;
  currentFieldTime: number;
  aggregateFieldTime: number;
  showCurrentFieldTime: boolean;
  queuedIncomingName?: string;
  canQueue: boolean;
  onQueue: () => void;
  onChangePosition: () => void;
  onUnavailable: () => void;
}) {
  const queued = Boolean(queuedIncomingName);
  const hasEarlierFieldTime = aggregateFieldTime > currentFieldTime;
  return (
    <div
      className={`player-time-row ${queued ? "queued" : ""} ${
        showCurrentFieldTime ? "" : "time-suppressed"
      }`}
    >
      <button
        type="button"
        className="player-time-main"
        disabled={!queued && !canQueue}
        onClick={onQueue}
        aria-label={`${queued ? "Edit planned substitution for" : "Plan"} ${player.name} out`}
        aria-describedby={`field-player-details-${player.id}${showCurrentFieldTime ? ` field-player-time-${player.id}` : ""}`}
      >
        <span
          className="player-time-name"
          id={`field-player-details-${player.id}`}
        >
          <GoalMarkedPlayerName
            label={player.name}
            number={player.number}
            goalCount={goalCount}
          />
          <small>{positionLabel}</small>
          {queued ? (
            <span className="bench-queue-status">
              <ArrowRightLeft size={12} aria-hidden="true" />
              Scheduled out for {queuedIncomingName}
            </span>
          ) : (
            hasEarlierFieldTime && (
              <span className="bench-total-status">
                {formatPlayerDuration(aggregateFieldTime)} played
              </span>
            )
          )}
        </span>
        {showCurrentFieldTime && (
          <span className="primary-time" id={`field-player-time-${player.id}`}>
            <small>Playing</small>
            <strong>{formatPlayerDuration(currentFieldTime)}</strong>
          </span>
        )}
      </button>
      <span className="player-row-actions">
        <IconButton
          className="icon-button"
          variant="default"
          size="medium"
          icon={Move}
          onClick={onChangePosition}
          aria-label={`Change positions for ${player.name}`}
        />
        <IconButton
          className="icon-button"
          variant="danger"
          size="medium"
          icon={UserRoundX}
          onClick={onUnavailable}
          aria-label={`Take ${player.name} out of game`}
        />
      </span>
    </div>
  );
}

function PlayerTimeRow({
  player,
  dragBindings,
  dragging,
  goalCount,
  currentBenchTime,
  showCurrentBenchTime,
  playedTime,
  aggregateBenchTime,
  paceWarning,
  queuedPositionLabel,
  queuedOutgoingPlayerName,
  onQueue,
  onUnavailable,
}: {
  player: Player;
  dragBindings: ReturnType<LiveBenchDragBindings>;
  dragging: boolean;
  goalCount: number;
  currentBenchTime: number;
  showCurrentBenchTime: boolean;
  playedTime: number;
  aggregateBenchTime: number;
  paceWarning: number | null;
  queuedPositionLabel?: string;
  queuedOutgoingPlayerName?: string;
  onQueue: () => void;
  onUnavailable: () => void;
}) {
  const queued = Boolean(queuedPositionLabel);
  const hasEarlierBenchTime = aggregateBenchTime > currentBenchTime;
  return (
    <div
      className={`player-time-row ${queued ? "queued" : ""} ${
        showCurrentBenchTime ? "" : "time-suppressed"
      }`}
    >
      <button
        type="button"
        className={`player-time-main ${dragging ? "bench-source-dragging" : ""}`}
        data-live-bench-player-id={player.id}
        {...dragBindings}
        onClick={onQueue}
        aria-label={
          queued ? `Edit ${player.name} going in` : `Plan ${player.name} in`
        }
        aria-describedby={`bench-player-details-${player.id}${showCurrentBenchTime ? ` bench-player-time-${player.id}` : ""}`}
      >
        <GripVertical
          className="bench-row-grip"
          size={18}
          aria-hidden="true"
          focusable="false"
        />
        <span
          className="player-time-name"
          id={`bench-player-details-${player.id}`}
        >
          <GoalMarkedPlayerName
            label={player.name}
            number={player.number}
            goalCount={goalCount}
          />
          <small>
            {playedTime > 0
              ? `${formatPlayerDuration(playedTime)} played`
              : "Not played yet"}
          </small>
          {queued ? (
            <span className="bench-queue-status">
              <ArrowRightLeft size={12} aria-hidden="true" />
              Scheduled in at {queuedPositionLabel}
              {queuedOutgoingPlayerName
                ? ` for ${queuedOutgoingPlayerName}`
                : ""}
            </span>
          ) : paceWarning !== null ? (
            <span className="minimum-play-warning">
              <CircleAlert size={13} aria-hidden="true" />
              Below {Math.round(paceWarning * 1000) / 10}% pace
            </span>
          ) : (
            hasEarlierBenchTime && (
              <span className="bench-total-status">
                {formatPlayerDuration(aggregateBenchTime)} bench
              </span>
            )
          )}
        </span>
        {showCurrentBenchTime && (
          <span className="primary-time" id={`bench-player-time-${player.id}`}>
            <small>Sitting</small>
            <strong>{formatPlayerDuration(currentBenchTime)}</strong>
          </span>
        )}
      </button>
      <IconButton
        className="icon-button"
        variant="danger"
        size="medium"
        icon={UserRoundX}
        onClick={onUnavailable}
        aria-label={`Take ${player.name} out of game`}
      />
    </div>
  );
}

type PlayerActionMenuOption = {
  id: string;
  label: string;
  number?: number;
  goalCount: number;
  preferenceIndex?: number;
  positionLabel?: string;
  preferredRoles?: Player["preferredRoles"];
  times: Array<{
    label: string;
    value: string;
  }>;
  statusText?: string;
  statusDirection?: "incoming" | "outgoing";
};

function movePlannedOptionsLast(options: PlayerActionMenuOption[]) {
  return [
    ...options.filter((option) => !option.statusText),
    ...options.filter((option) => option.statusText),
  ];
}

function orderSubstitutionPairsForDisplay(pairs: SubstitutionPair[]) {
  return pairs
    .map((pair, index) => ({ pair, index }))
    .sort(
      (first, second) =>
        Number(Boolean(first.pair.keeperHandoff)) -
        Number(Boolean(second.pair.keeperHandoff)),
    );
}

function PlayerActionMenu({
  id,
  label,
  value,
  options,
  align,
  menuTitle,
  showPreferenceFit = true,
  activeMenuId,
  onActiveMenuChange,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: PlayerActionMenuOption[];
  align: "start" | "end";
  menuTitle: string;
  showPreferenceFit?: boolean;
  activeMenuId: string | null;
  onActiveMenuChange: (menuId: string | null) => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);

  return (
    <ActionMenu
      open={activeMenuId === id}
      onOpenChange={(open) => {
        onActiveMenuChange(open ? id : null);
      }}
    >
      <ActionMenu.Anchor>
        <Button
          className="player-action-menu-trigger"
          variant="default"
          size="large"
          block
          trailingVisual={ChevronDown}
          aria-label={label}
          data-player-menu-id={id}
        >
          {selected?.label ?? "Choose player"}
        </Button>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay
        align={align}
        side="outside-bottom"
        displayInViewport
        width="medium"
        className="sideline-player-action-menu"
      >
        <div className="player-action-menu-header">
          <strong>{menuTitle}</strong>
        </div>
        <ActionList
          variant="full"
          selectionVariant="single"
          className="sideline-player-action-list"
        >
          {options.map((option) => {
            const selected = option.id === value;
            return (
              <ActionList.Item
                className="sideline-player-action-item"
                key={option.id}
                data-player-id={option.id}
                selected={selected}
                size="large"
                onSelect={() => onChange(option.id)}
              >
                <span
                  className={`player-action-menu-row ${showPreferenceFit ? "" : "preference-fit-hidden"}`}
                >
                  <span className="replacement-player-summary">
                    <GoalMarkedPlayerName
                      label={option.label}
                      number={option.number}
                      goalCount={option.goalCount}
                    />
                    {!showPreferenceFit && selected && (
                      <Check
                        className="replacement-selected-icon"
                        size={15}
                        aria-label="Selected"
                      />
                    )}
                  </span>
                  {showPreferenceFit &&
                    option.preferenceIndex !== undefined && (
                      <span
                        className={preferenceFitClassName(
                          option.preferenceIndex,
                        )}
                      >
                        {selected && (
                          <Check
                            className="replacement-selected-icon"
                            size={15}
                            aria-hidden="true"
                          />
                        )}
                        <span>
                          {preferenceFitLabel(option.preferenceIndex)}
                        </span>
                      </span>
                    )}
                  {option.positionLabel && (
                    <span className="replacement-player-position">
                      {option.positionLabel}
                    </span>
                  )}
                  {option.preferredRoles && (
                    <span
                      className="replacement-player-preferences"
                      aria-label={`Preferred roles: ${option.preferredRoles
                        .map(preferredRoleLabel)
                        .join(" and ")}`}
                    >
                      <span>Prefers</span>
                      <strong>
                        {compactPreferredRolesLabel(option.preferredRoles)}
                      </strong>
                    </span>
                  )}
                  <span className="replacement-player-times">
                    {option.times.map((time) => (
                      <span key={time.label}>
                        <span>{time.label}</span>
                        <strong>{time.value}</strong>
                      </span>
                    ))}
                  </span>
                  {option.statusText && (
                    <span
                      className={`player-action-menu-status ${
                        option.statusDirection === "outgoing"
                          ? "outgoing-status"
                          : "incoming-status"
                      }`}
                    >
                      <ArrowRightLeft size={13} aria-hidden="true" />
                      {option.statusText}
                    </span>
                  )}
                </span>
              </ActionList.Item>
            );
          })}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

function getKeeperChangeNotice(
  game: ActiveGame,
  team: Team,
  pairs: SubstitutionPair[],
  timing: "next-rotation" | "now",
  {
    warnAboutRest = true,
    compact = false,
  }: { warnAboutRest?: boolean; compact?: boolean } = {},
) {
  const status = getGoalkeeperChangeStatus(
    game,
    pairs,
    timing === "next-rotation"
      ? getNextSubstitutionSeconds(game)
      : game.clock.elapsedSeconds,
    team,
  );
  if (!status) return null;
  const needsRest = warnAboutRest && status.needsRest;
  const messages: string[] = [];
  const outgoingName = playerName(team, status.outgoingPlayerId);
  const incomingName = playerName(team, status.incomingPlayerId);
  if (status.early) {
    const target = formatDuration(status.targetSeconds);
    messages.push(
      compact
        ? "Early keeper change."
        : timing === "next-rotation"
          ? `${outgoingName} would not complete their recommended ${target} turn in goal by the next rotation.`
          : `Sending now would end ${outgoingName}'s turn before the recommended ${target}.`,
    );
  }
  if (needsRest) {
    const interval = formatDuration(status.intervalSeconds);
    messages.push(
      timing === "next-rotation"
        ? `${incomingName} would not have their recommended ${interval} bench turn before the next rotation.`
        : `${incomingName} has not had their recommended ${interval} bench turn before taking over.`,
    );
  }
  const incomingKeeper = team.roster.find(
    (player) => player.id === status.incomingPlayerId,
  );
  if (incomingKeeper && !incomingKeeper.preferredRoles.includes("goalkeeper")) {
    messages.push(`${incomingName} does not typically play goalkeeper.`);
  }
  if (messages.length === 0) return null;
  return {
    title: status.early
      ? timing === "next-rotation"
        ? "Early keeper change"
        : "Wait on this rotation"
      : needsRest
        ? "Keeper needs more rest"
        : null,
    message: messages.join(" "),
  };
}

function KeeperChangeNotice({
  notice,
  id,
}: {
  notice: ReturnType<typeof getKeeperChangeNotice>;
  id: string;
}) {
  if (!notice) return null;
  return (
    <Banner
      id={id}
      className="keeper-change-warning"
      title={notice.title ? undefined : "Position preference"}
      hideTitle={!notice.title}
      variant="warning"
      layout="compact"
      role="status"
    >
      {notice.title && <Banner.Title as="h3">{notice.title}</Banner.Title>}
      <Banner.Description>{notice.message}</Banner.Description>
    </Banner>
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
  const countLimitId = useId();
  const routineRotation = getRoutineRotationStatus(game);
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
  const [overrideError, setOverrideError] = useState("");
  const plannerContentRef = useRef<HTMLDivElement>(null);
  const overrideFocusIndex = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (overrideFocusIndex.current === null) return;
    plannerContentRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-player-menu-id="in-${overrideFocusIndex.current}"]`,
      )
      ?.focus();
    overrideFocusIndex.current = null;
  }, [pairs]);
  const [activePlayerMenuId, setActivePlayerMenuId] = useState<string | null>(
    null,
  );
  const blockedPlayerMenuId = useRef<string | null>(null);
  const getPlayerMenuId = (target: EventTarget) =>
    target instanceof Element
      ? target.closest<HTMLElement>("[data-player-menu-id]")?.dataset
          .playerMenuId
      : undefined;
  const dismissMenuOnSelectorPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const targetMenuId = getPlayerMenuId(event.target);
    if (
      activePlayerMenuId &&
      targetMenuId &&
      targetMenuId !== activePlayerMenuId
    ) {
      blockedPlayerMenuId.current = targetMenuId;
      event.preventDefault();
      event.stopPropagation();
      setActivePlayerMenuId(null);
    }
  };
  const consumeDismissalClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const targetMenuId = getPlayerMenuId(event.target);
    const switchingMenus =
      targetMenuId &&
      ((blockedPlayerMenuId.current === targetMenuId &&
        blockedPlayerMenuId.current !== null) ||
        (activePlayerMenuId && targetMenuId !== activePlayerMenuId));
    if (!switchingMenus) return;

    blockedPlayerMenuId.current = null;
    event.preventDefault();
    event.stopPropagation();
    setActivePlayerMenuId(null);
  };
  const formation = getFormation(game.formationId);
  const planningGame = getSubstitutionPlanningSnapshot(game);
  const getRemainingGame = (current: SubstitutionPair[]) => {
    const reservedFieldIds = new Set(
      current.flatMap((pair) => [
        pair.outPlayerId,
        ...(pair.keeperHandoff ? [pair.keeperHandoff.playerId] : []),
      ]),
    );
    const selectedInIds = new Set(current.map((pair) => pair.inPlayerId));
    return {
      ...game,
      assignments: Object.fromEntries(
        Object.entries(game.assignments).filter(
          ([, playerId]) => !reservedFieldIds.has(playerId),
        ),
      ),
      benchIds: game.benchIds.filter(
        (playerId) => !selectedInIds.has(playerId),
      ),
    };
  };
  const availableCount = hasCoachSelections
    ? pairs.length + getMaxSubstitutionCount(getRemainingGame(pairs), team)
    : getMaxSubstitutionCount(game, team);
  const maxCount = Math.min(
    game.benchIds.length,
    Object.keys(game.assignments).length,
  );
  const countIsLimited = availableCount < maxCount;
  const handoff = pairs.find((pair) => pair.keeperHandoff)?.keeperHandoff;
  const goalkeeperPosition = formation.positions.find(
    (position) => position.role === "goalkeeper",
  );
  const canOverrideKeeper =
    countIsLimited &&
    !handoff &&
    goalkeeperPosition &&
    (hasCoachSelections ? getRemainingGame(pairs) : game).assignments[
      goalkeeperPosition.id
    ] &&
    maxCount === Object.keys(game.assignments).length;
  const keeperNotice = getKeeperChangeNotice(
    game,
    team,
    pairs,
    "next-rotation",
  );
  const showCountLimit = Boolean(
    handoff && countIsLimited && !canOverrideKeeper,
  );
  const keeperNoticeId = `${countLimitId}-keeper`;

  const overrideKeeper = () => {
    if (!goalkeeperPosition || !canOverrideKeeper) {
      setOverrideError(
        "The keeper plan has changed. Review the current swaps before overriding.",
      );
      return;
    }
    const remaining = getRemainingGame(pairs);
    const outfieldGame = {
      ...remaining,
      assignments: Object.fromEntries(
        Object.entries(remaining.assignments).filter(
          ([positionId]) => positionId !== goalkeeperPosition.id,
        ),
      ),
    };
    const outfieldPairs = [
      ...pairs,
      ...suggestSubstitutions(outfieldGame, maxCount - pairs.length - 1, team),
    ];
    const remainingIncoming = getRemainingGame(outfieldPairs).benchIds.filter(
      (id) => !game.unavailableIds.includes(id),
    );
    if (
      remainingIncoming.length !== 1 ||
      outfieldPairs.length !== maxCount - 1
    ) {
      setOverrideError(
        "The available players have changed. Review the current swaps before overriding.",
      );
      return;
    }
    const nextPairs = [
      ...outfieldPairs,
      {
        positionId: goalkeeperPosition.id,
        outPlayerId: game.assignments[goalkeeperPosition.id],
        inPlayerId: remainingIncoming[0],
      },
    ];
    const errors = validateSubstitutionPairs(game, nextPairs);
    if (errors.length) {
      setOverrideError(errors.join(". "));
      return;
    }
    setOverrideError("");
    setActivePlayerMenuId(null);
    setHasCoachSelections(true);
    overrideFocusIndex.current = nextPairs.length - 1;
    setPairs(nextPairs);
    setCount(nextPairs.length);
  };

  const changeCount = (nextCount: number) => {
    setOverrideError("");
    if (!hasCoachSelections) {
      const allowEarlyKeeperChange = Boolean(
        nextCount > availableCount && canOverrideKeeper,
      );
      const nextPairs = suggestSubstitutions(game, nextCount, team, {
        allowEarlyKeeperChange,
      });
      if (nextPairs.length !== nextCount) {
        setOverrideError(
          `A full-team swap needs a replacement keeper from the bench. Choose the keeper pairing manually to swap all ${nextCount}.`,
        );
        return;
      }
      const errors = validateSubstitutionPairs(game, nextPairs);
      if (errors.length) {
        setOverrideError(errors.join(". "));
        return;
      }
      if (allowEarlyKeeperChange) {
        overrideFocusIndex.current = nextPairs.findIndex(
          (pair) => pair.positionId === goalkeeperPosition?.id,
        );
      }
      setActivePlayerMenuId(null);
      setPairs(nextPairs);
      setCount(nextCount);
      return;
    }
    if (nextCount > availableCount && canOverrideKeeper) {
      overrideKeeper();
      return;
    }
    setCount(nextCount);
    setPairs((current) => {
      if (nextCount <= current.length) {
        return current.slice(0, nextCount);
      }

      const additionalPairs = suggestSubstitutions(
        getRemainingGame(current),
        nextCount - current.length,
        team,
      );

      return [...current, ...additionalPairs];
    });
  };
  const updateIncomingPlayer = (index: number, inPlayerId: string) => {
    setHasCoachSelections(true);
    setPairs((current) =>
      reassignIncomingSubstitution(game, current, index, inPlayerId, team),
    );
  };
  const updateOutgoingPlayer = (index: number, outPlayerId: string) => {
    setHasCoachSelections(true);
    setPairs((current) =>
      reassignOutgoingSubstitution(game, current, index, outPlayerId),
    );
  };
  const removePair = (index: number) => {
    if (pairs.length <= 1) return;
    const nextPairs = pairs.filter((_, pairIndex) => pairIndex !== index);
    setHasCoachSelections(true);
    setActivePlayerMenuId(null);
    setPairs(nextPairs);
    setCount(nextPairs.length);
  };
  const duplicateOuts =
    new Set(pairs.map((pair) => pair.outPlayerId)).size !== pairs.length;
  const duplicateIns =
    new Set(pairs.map((pair) => pair.inPlayerId)).size !== pairs.length;
  const pairErrors = validateSubstitutionPairs(game, pairs);
  const waitingForManualCount =
    !routineRotation.recommended && pairs.length === 0;
  const valid =
    pairs.length === count &&
    !duplicateOuts &&
    !duplicateIns &&
    pairErrors.length === 0;
  const timeBandSeconds = getSubstitutionTimeBandSize(game);
  const rotationIntervalSeconds =
    getSubstitutionReminderStatus(game).intervalSeconds;
  const outgoingChoices = Object.entries(game.assignments);
  const incomingChoices = [...game.benchIds].sort((playerA, playerB) => {
    const playerAFieldSeconds = game.totals[playerA]?.fieldSeconds ?? 0;
    const playerBFieldSeconds = game.totals[playerB]?.fieldSeconds ?? 0;
    const playerABenchSeconds = getCurrentBenchSeconds(planningGame, playerA);
    const playerBBenchSeconds = getCurrentBenchSeconds(planningGame, playerB);
    const toBand = (seconds: number) =>
      Math.floor(Math.max(0, seconds) / timeBandSeconds) * timeBandSeconds;
    return (
      toBand(playerAFieldSeconds) - toBand(playerBFieldSeconds) ||
      toBand(playerBBenchSeconds) - toBand(playerABenchSeconds) ||
      playerAFieldSeconds - playerBFieldSeconds ||
      playerBBenchSeconds - playerABenchSeconds ||
      playerName(team, playerA).localeCompare(playerName(team, playerB))
    );
  });

  return (
    <SidelineDialog
      title="Substitution plan"
      description={
        routineRotation.recommended
          ? routineRotation.promptRecommended
            ? "Suggested for fairness. Ready the plan now, then send the players in when the change happens."
            : "Suggested for the period break. Ready the plan now, then send the players in when the change happens."
          : "No further reminders are scheduled. You can still create a substitution plan."
      }
      onClose={onClose}
      width="720px"
      className="substitution-dialog substitution-sheet"
      footer={
        <>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="primary-action"
            variant="primary"
            size="large"
            leadingVisual={Check}
            disabled={!valid}
            onClick={() => onConfirm(pairs)}
          >
            {waitingForManualCount
              ? "Choose a swap count"
              : `Ready ${count} swap${count === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div
        ref={plannerContentRef}
        className="substitution-planner-content"
        onPointerDownCapture={dismissMenuOnSelectorPointerDown}
        onClickCapture={consumeDismissalClick}
      >
        <div className="sub-count">
          <span>Players to swap</span>
          <div
            className="stepper"
            role="group"
            aria-label="Players to swap"
            aria-describedby={
              showCountLimit
                ? countLimitId
                : keeperNotice
                  ? keeperNoticeId
                  : undefined
            }
          >
            {Array.from({ length: maxCount }, (_, index) => index + 1).map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  className={count === value ? "active" : ""}
                  aria-pressed={count === value}
                  disabled={value > availableCount && !canOverrideKeeper}
                  onClick={() => changeCount(value)}
                >
                  {value}
                </button>
              ),
            )}
          </div>
        </div>
        {showCountLimit && handoff && (
          <p id={countLimitId} className="sub-count-explanation">
            {playerName(team, handoff.playerId)} is moving to goal and must stay
            on the field. This plan can include up to {availableCount} swaps.
          </p>
        )}
        {overrideError && (
          <p className="error-message" role="alert">
            {overrideError}
          </p>
        )}
        <KeeperChangeNotice notice={keeperNotice} id={keeperNoticeId} />

        <div className="swap-list">
          <div className="swap-column-headings" aria-hidden="true">
            <span className="in-label">IN</span>
            <span className="out-label">OUT</span>
          </div>
          {orderSubstitutionPairsForDisplay(pairs).map(
            ({ pair, index: originalIndex }, displayIndex) => {
              const position = formation.positions.find(
                (item) => item.id === pair.positionId,
              );
              const handoffPosition = pair.keeperHandoff
                ? formation.positions.find(
                    (item) => item.id === pair.keeperHandoff?.fromPositionId,
                  )
                : undefined;
              const outgoingOptions = outgoingChoices
                .map(([positionId, playerId]) => {
                  const usedInSwap = pairs.findIndex(
                    (otherPair, pairIndex) =>
                      pairIndex !== originalIndex &&
                      (otherPair.outPlayerId === playerId ||
                        otherPair.keeperHandoff?.playerId === playerId),
                  );
                  const candidatePosition = formation.positions.find(
                    (item) => item.id === positionId,
                  );
                  const formationIndex = formation.positions.findIndex(
                    (item) => item.id === positionId,
                  );
                  const incomingPlayer = team.roster.find(
                    (item) => item.id === pair.inPlayerId,
                  );
                  const preferenceIndex =
                    incomingPlayer && candidatePosition
                      ? incomingPlayer.preferredRoles.indexOf(
                          candidatePosition.role,
                        )
                      : -1;
                  return {
                    id: playerId,
                    label: playerName(team, playerId),
                    number: team.roster.find((player) => player.id === playerId)
                      ?.number,
                    goalCount: playerGoalCount(game, playerId),
                    alreadyPlanned: usedInSwap >= 0,
                    preferenceIndex:
                      preferenceIndex === -1
                        ? Number.POSITIVE_INFINITY
                        : preferenceIndex,
                    currentFieldSeconds: getCurrentFieldSeconds(
                      planningGame,
                      playerId,
                    ),
                    totalFieldSeconds: game.totals[playerId]?.fieldSeconds ?? 0,
                    formationIndex,
                    timeBandSeconds,
                    rotationIntervalSeconds,
                    positionLabel: candidatePosition?.label ?? "Open position",
                    times: [
                      {
                        label: "Playing",
                        value: formatPlayerDuration(
                          getCurrentFieldSeconds(game, playerId),
                        ),
                      },
                      {
                        label: "Total",
                        value: formatPlayerDuration(
                          game.totals[playerId]?.fieldSeconds ?? 0,
                          "Not played yet",
                        ),
                      },
                    ],
                    statusText:
                      usedInSwap >= 0
                        ? `Scheduled out for ${playerName(
                            team,
                            pairs[usedInSwap].inPlayerId,
                          )}`
                        : undefined,
                    statusDirection: "outgoing" as const,
                  };
                })
                .sort(compareSubstitutionDestinations);
              const incomingOptions = movePlannedOptionsLast(
                incomingChoices.map((playerId) => {
                  const usedInSwap = pairs.findIndex(
                    (otherPair, pairIndex) =>
                      pairIndex !== originalIndex &&
                      otherPair.inPlayerId === playerId,
                  );
                  const player = team.roster.find(
                    (item) => item.id === playerId,
                  );
                  return {
                    id: playerId,
                    label: playerName(team, playerId),
                    number: player?.number,
                    goalCount: playerGoalCount(game, playerId),
                    preferredRoles: player?.preferredRoles,
                    times: [
                      {
                        label: "Bench",
                        value: formatPlayerDuration(
                          getCurrentBenchSeconds(game, playerId),
                        ),
                      },
                      {
                        label: "Played",
                        value: formatPlayerDuration(
                          game.totals[playerId]?.fieldSeconds ?? 0,
                          "Not played yet",
                        ),
                      },
                    ],
                    statusText:
                      usedInSwap >= 0
                        ? `Scheduled in for ${playerName(
                            team,
                            pairs[usedInSwap].outPlayerId,
                          )}`
                        : undefined,
                  };
                }),
              );
              return (
                <div
                  className={`swap-row ${
                    pair.keeperHandoff ? "keeper-handoff-row" : ""
                  }`}
                  key={originalIndex}
                >
                  <span className="swap-number">{displayIndex + 1}</span>
                  <div className="swap-player-choice">
                    <PlayerActionMenu
                      id={`in-${originalIndex}`}
                      label={`Swap ${displayIndex + 1} incoming player`}
                      value={pair.inPlayerId}
                      options={incomingOptions}
                      align="start"
                      menuTitle="Who should go in?"
                      showPreferenceFit={false}
                      activeMenuId={activePlayerMenuId}
                      onActiveMenuChange={setActivePlayerMenuId}
                      onChange={(playerId) =>
                        updateIncomingPlayer(originalIndex, playerId)
                      }
                    />
                  </div>
                  <span className="swap-transfer">
                    <small>{(handoffPosition ?? position)?.mediumLabel}</small>
                    <ArrowRightLeft size={22} aria-hidden="true" />
                  </span>
                  <div className="swap-player-choice">
                    {pair.keeperHandoff ? (
                      <Button
                        className="player-action-menu-trigger fixed-player"
                        variant="default"
                        size="large"
                        block
                        disabled
                        aria-label={`${playerName(
                          team,
                          pair.outPlayerId,
                        )} leaves goal`}
                      >
                        {playerName(team, pair.outPlayerId)}
                      </Button>
                    ) : (
                      <PlayerActionMenu
                        id={`out-${originalIndex}`}
                        label={`Swap ${displayIndex + 1} outgoing player`}
                        value={pair.outPlayerId}
                        options={outgoingOptions}
                        align="end"
                        menuTitle={`Who should ${playerName(
                          team,
                          pair.inPlayerId,
                        )} replace?`}
                        activeMenuId={activePlayerMenuId}
                        onActiveMenuChange={setActivePlayerMenuId}
                        onChange={(playerId) =>
                          updateOutgoingPlayer(originalIndex, playerId)
                        }
                      />
                    )}
                  </div>
                  <IconButton
                    className="swap-remove-action"
                    variant="invisible"
                    size="large"
                    icon={Trash2}
                    aria-label={`Remove substitution ${
                      displayIndex + 1
                    }: ${playerName(team, pair.inPlayerId)} for ${playerName(
                      team,
                      pair.outPlayerId,
                    )}`}
                    disabled={pairs.length <= 1}
                    onClick={() => removePair(originalIndex)}
                  />
                  {pair.keeperHandoff && (
                    <p
                      className="keeper-handoff-note"
                      aria-label={`Move ${playerName(
                        team,
                        pair.keeperHandoff.playerId,
                      )} from ${
                        handoffPosition?.label ?? "outfield"
                      } to Goalkeeper`}
                    >
                      <strong>MOVE</strong>{" "}
                      {playerName(team, pair.keeperHandoff.playerId)} from{" "}
                      {handoffPosition?.mediumLabel ?? "outfield"} to{" "}
                      {position?.mediumLabel ?? "Goalkeeper"}
                    </p>
                  )}
                </div>
              );
            },
          )}
        </div>

        {!valid && !waitingForManualCount && (
          <p className="error-message">
            {pairErrors[0] ??
              "Choose a different outgoing and incoming player for every swap."}
          </p>
        )}
      </div>
    </SidelineDialog>
  );
}

function ReadySwapList({
  pairs,
  formation,
  team,
  game,
  onRemove,
  showGoalMarkers = true,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  onRemove?: (pair: SubstitutionPair) => void;
  showGoalMarkers?: boolean;
}) {
  const [revealedPairKey, setRevealedPairKey] = useState<string | null>(null);
  const swipeStart = useRef<{
    pairKey: string;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div className={`ready-swap-list ${onRemove ? "removable" : ""}`}>
      <div className="ready-swap-headings" aria-hidden="true">
        <span className="in-label">IN</span>
        <span className="out-label">OUT</span>
      </div>
      {orderSubstitutionPairsForDisplay(pairs).map(({ pair }, displayIndex) => {
        const position = formation.positions.find(
          (item) => item.id === pair.positionId,
        );
        const handoffPosition = pair.keeperHandoff
          ? formation.positions.find(
              (item) => item.id === pair.keeperHandoff?.fromPositionId,
            )
          : undefined;
        const pairKey = `${pair.outPlayerId}:${pair.inPlayerId}:${pair.positionId}`;
        const outgoingName = playerName(team, pair.outPlayerId);
        const incomingName = playerName(team, pair.inPlayerId);
        return (
          <div
            className={`ready-swap-shell ${
              revealedPairKey === pairKey ? "swipe-revealed" : ""
            }`}
            key={pairKey}
          >
            <div
              className="ready-swap"
              onTouchStart={(event) => {
                if (!onRemove) return;
                const touch = event.touches[0];
                if (touch) {
                  swipeStart.current = {
                    pairKey,
                    x: touch.clientX,
                    y: touch.clientY,
                  };
                }
              }}
              onTouchEnd={(event) => {
                const start = swipeStart.current;
                swipeStart.current = null;
                const touch = event.changedTouches[0];
                if (
                  !onRemove ||
                  !start ||
                  !touch ||
                  start.pairKey !== pairKey
                ) {
                  return;
                }
                const deltaX = touch.clientX - start.x;
                const deltaY = touch.clientY - start.y;
                if (
                  Math.abs(deltaX) < 48 ||
                  Math.abs(deltaX) < Math.abs(deltaY) * 1.25
                ) {
                  return;
                }
                setRevealedPairKey(deltaX < 0 ? pairKey : null);
              }}
              onTouchCancel={() => {
                swipeStart.current = null;
              }}
            >
              <span className="ready-swap-number">{displayIndex + 1}</span>
              <span className="ready-player in">
                <ReadyPlayerIdentity
                  team={team}
                  playerId={pair.inPlayerId}
                  goalCount={
                    showGoalMarkers ? playerGoalCount(game, pair.inPlayerId) : 0
                  }
                />
              </span>
              <span className="ready-direction">
                <small>{(handoffPosition ?? position)?.mediumLabel}</small>
                <ArrowRightLeft size={24} aria-hidden="true" />
              </span>
              <span className="ready-player out">
                <ReadyPlayerIdentity
                  team={team}
                  playerId={pair.outPlayerId}
                  goalCount={
                    showGoalMarkers
                      ? playerGoalCount(game, pair.outPlayerId)
                      : 0
                  }
                />
              </span>
              {pair.keeperHandoff && (
                <span
                  className="ready-keeper-handoff"
                  aria-label={`Move ${playerName(
                    team,
                    pair.keeperHandoff.playerId,
                  )} from ${
                    handoffPosition?.label ?? "outfield"
                  } to Goalkeeper`}
                >
                  <strong>MOVE</strong>{" "}
                  {playerName(team, pair.keeperHandoff.playerId)} from{" "}
                  {handoffPosition?.mediumLabel ?? "outfield"} to{" "}
                  {position?.mediumLabel ?? "Goalkeeper"}
                </span>
              )}
            </div>
            {onRemove && (
              <IconButton
                className="ready-swap-remove"
                variant="invisible"
                size="large"
                icon={Trash2}
                aria-label={`Remove ${outgoingName} for ${incomingName} substitution`}
                onClick={() => {
                  setRevealedPairKey(null);
                  onRemove(pair);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReadyPlayerIdentity({
  team,
  playerId,
  goalCount,
}: {
  team: Team;
  playerId: string;
  goalCount: number;
}) {
  const player = team.roster.find((item) => item.id === playerId);

  return (
    <span className="ready-player-identity">
      <GoalMarkedPlayerName
        label={player?.name ?? "Unknown player"}
        number={player?.number}
        goalCount={goalCount}
      />
    </span>
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
  onRemove,
  onExecute,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  errors: string[];
  onClose: () => void;
  onEdit: () => void;
  onRemove: (pair: SubstitutionPair) => void;
  onExecute: () => void;
}) {
  const keeperNoticeId = useId();
  const keeperNotice = getKeeperChangeNotice(game, team, pairs, "now");

  return (
    <SidelineDialog
      title={`Substitution plan (${pairs.length})`}
      description={
        <>
          Send 'em in now or you can send them in later. Your call coach.
          <span className="mobile-inline-instruction">
            {" "}
            Swipe a substitution to remove it.
          </span>
        </>
      }
      className="substitution-ready-sheet queued-substitution-sheet"
      width="620px"
      onClose={onClose}
      footerClassName="queued-plan-actions"
      footer={
        <>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            leadingVisual={Pencil}
            onClick={onEdit}
          >
            Edit plan
          </Button>
          <Button
            className="primary-action"
            variant="primary"
            size="large"
            leadingVisual={Check}
            disabled={errors.length > 0}
            aria-describedby={keeperNotice ? keeperNoticeId : undefined}
            onClick={onExecute}
          >
            Send players in
          </Button>
        </>
      }
    >
      <KeeperChangeNotice notice={keeperNotice} id={keeperNoticeId} />
      <ReadySwapList
        pairs={pairs}
        formation={formation}
        team={team}
        game={game}
        onRemove={onRemove}
        showGoalMarkers={false}
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
    </SidelineDialog>
  );
}

function SubstitutionSummary({
  pairs,
  formation,
  team,
  game,
  description = "The lineup and timers are updated.",
  onClose,
}: {
  pairs: SubstitutionPair[];
  formation: ReturnType<typeof getFormation>;
  team: Team;
  game: ActiveGame;
  description?: string;
  onClose: () => void;
}) {
  const event = game.history.at(-1);
  return (
    <SidelineDialog
      title={
        event && isImmediateSubstitution(event)
          ? "Players swapped"
          : "Players are in"
      }
      description={description}
      className="substitution-ready-sheet"
      width="620px"
      onClose={onClose}
      footerClassName="single-action-footer"
      footer={
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          onClick={onClose}
        >
          Done
        </Button>
      }
    >
      <ReadySwapList
        pairs={pairs}
        formation={formation}
        team={team}
        game={game}
      />
    </SidelineDialog>
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
    <SidelineDialog
      title="Player ready"
      description="The game is updated. Send this player onto the field."
      className="substitution-ready-sheet"
      width="620px"
      onClose={onClose}
      footerClassName="single-action-footer"
      footer={
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          onClick={onClose}
        >
          Done
        </Button>
      }
    >
      <div className="ready-entry">
        <span className="ready-player in">
          <small>IN</small>
          <GoalMarkedPlayerName
            label={playerName(team, entry.playerId)}
            number={
              team.roster.find((player) => player.id === entry.playerId)?.number
            }
            goalCount={playerGoalCount(game, entry.playerId)}
          />
        </span>
        <span className="ready-position">
          <small>POSITION</small>
          <strong>{position?.label ?? "Open position"}</strong>
        </span>
      </div>
    </SidelineDialog>
  );
}

function GameSummary({
  game,
  team,
  returnLabel,
  onClose,
}: {
  game: ActiveGame;
  team: Team;
  returnLabel: SummaryReturnLabel;
  onClose: () => void;
}) {
  const formation = getFormation(game.formationId);
  const summaries = summarizePlayerPositions(game).sort(
    (a, b) =>
      b.goals.length - a.goals.length ||
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
            const scoredHatTrick = summary.goals.length >= 3;
            return (
              <li
                key={summary.playerId}
                className={scoredHatTrick ? "hat-trick-summary" : undefined}
              >
                <div className="player-summary-heading">
                  <span className="player-summary-name">
                    <GoalMarkedPlayerName
                      label={playerDisplayName}
                      goalCount={summary.goals.length}
                    />
                    {scoredHatTrick && (
                      <span className="hat-trick-summary-stamp">Hat trick</span>
                    )}
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

        <GameLog game={game} formation={formation} team={team} completed />
      </main>

      <footer className="game-summary-actions">
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          onClick={onClose}
        >
          {returnLabel}
        </Button>
      </footer>
    </div>
  );
}

function GoalMarkedPlayerName({
  label,
  number,
  goalCount,
  emphasized = true,
  compact = false,
}: {
  label: string;
  number?: number;
  goalCount: number;
  emphasized?: boolean;
  compact?: boolean;
}) {
  const identity =
    number === undefined ? (
      label
    ) : (
      <PlayerIdentity name={label} number={number} />
    );
  return (
    <span className="player-name-with-goals">
      {emphasized ? <strong>{identity}</strong> : <span>{identity}</span>}
      {goalCount > 0 && (
        <PlayerGoalMarkers
          label={label}
          goalCount={goalCount}
          compact={compact}
        />
      )}
    </span>
  );
}

function PlayerGoalSummary({
  label,
  goalCount,
}: {
  label: string;
  goalCount: number;
}) {
  return goalCount > 0 ? (
    <PlayerGoalMarkers label={label} goalCount={goalCount} />
  ) : (
    <span className="player-goals-empty">No goals… yet!</span>
  );
}

function PlayerGoalMarkers({
  label,
  goalCount,
  compact = false,
}: {
  label: string;
  goalCount: number;
  compact?: boolean;
}) {
  const hatTrick = goalCount >= 3;
  const visibleMarkerCount = compact && hatTrick ? 1 : goalCount === 3 ? 3 : 1;
  const showGoalCount = goalCount > 3 || (compact && hatTrick);

  return (
    <span
      className="player-goal-total"
      aria-label={`${label} scored ${goalCount} ${
        goalCount === 1 ? "goal" : "goals"
      }`}
    >
      {hatTrick
        ? Array.from({ length: visibleMarkerCount }, (_, index) => (
            <HatTrickBallIcon key={index} />
          ))
        : Array.from({ length: goalCount }, (_, index) => (
            <SoccerBallIcon key={index} />
          ))}
      {showGoalCount && (
        <span className="goal-count-overflow" aria-hidden="true">
          ×{goalCount}
        </span>
      )}
    </span>
  );
}

function SoccerBallPanels() {
  return (
    <>
      <circle cx="12" cy="12" r="9" />
      <path
        d="m12 6.8 3.1 2.3-1.2 3.6h-3.8L8.9 9.1 12 6.8Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M12 3 19.8 9.2 16.8 18.5H7.2L4.2 9.2 12 3Zm0 3.8V3m3.1 6.1 4.7.1m-5.9 3.5 2.9 5.8m-6.7-5.8-2.9 5.8M8.9 9.1l-4.7.1"
        fill="none"
      />
    </>
  );
}

function SoccerBallIcon() {
  return (
    <svg className="soccer-ball-icon" viewBox="0 0 24 24" aria-hidden="true">
      <SoccerBallPanels />
    </svg>
  );
}

function HatTrickBallIcon() {
  return (
    <svg
      className="soccer-ball-icon hat-trick-icon"
      viewBox="0 0 24 31"
      aria-hidden="true"
    >
      <g transform="translate(1.333 11.333) scale(0.889)">
        <SoccerBallPanels />
      </g>
      <path d="M7.2 1.5h9.6l.8 14H6.4l.8-14Z" fill="currentColor" />
      <path d="M4 15.5h16" fill="none" strokeWidth="2.4" />
      <path d="M6.6 12.2h10.8" fill="none" stroke="var(--paper)" />
    </svg>
  );
}

function GameLog({
  game,
  formation,
  team,
  onUndo,
  completed = false,
  followsRoster = false,
}: {
  game: ActiveGame;
  formation: ReturnType<typeof getFormation>;
  team: Team;
  onUndo?: () => void;
  completed?: boolean;
  followsRoster?: boolean;
}) {
  if (!completed && game.history.length === 0) return null;

  const periodLength = game.durationSeconds / game.periodCount;
  const periodLabel = game.periodCount === 4 ? "Quarter" : "Half";
  const periodEndByNumber = new Map(
    game.periodEnds.map((periodEnd) => [periodEnd.period, periodEnd]),
  );
  const periodMarkers = game.periodEnds.map((periodEnd) => {
    const previousEnd = periodEndByNumber.get(periodEnd.period - 1);
    const periodStartedAt = previousEnd?.atSeconds ?? 0;
    const addedTimeSeconds = Math.max(
      0,
      periodEnd.atSeconds - periodStartedAt - periodLength,
    );
    const nextPeriodStarted = game.period.current > periodEnd.period;
    const gameEnded = completed && periodEnd.period === game.period.current;
    return {
      kind: "period" as const,
      id: `period-${periodEnd.period}`,
      atSeconds: periodEnd.atSeconds,
      displaySeconds: getMatchClockSeconds(game, periodEnd.atSeconds),
      order: 2,
      title: gameEnded
        ? "Game ended"
        : nextPeriodStarted
          ? `${periodLabel} ${periodEnd.period + 1} started`
          : `${periodLabel} ${periodEnd.period} ended`,
      detail:
        gameEnded || nextPeriodStarted
          ? `${periodLabel} ${periodEnd.period} ended${
              addedTimeSeconds > 0
                ? ` · +${formatDuration(addedTimeSeconds)} added time`
                : ""
            }`
          : `Period break${
              addedTimeSeconds > 0
                ? ` · +${formatDuration(addedTimeSeconds)} added time`
                : ""
            }`,
    };
  });
  const timelineItems = [
    ...(game.clock.elapsedSeconds > 0 ||
    game.clock.running ||
    game.history.length > 0 ||
    game.periodEnds.length > 0
      ? [
          {
            kind: "period" as const,
            id: "period-start-1",
            atSeconds: 0,
            displaySeconds: 0,
            order: 0,
            title: `${periodLabel} 1 started`,
            detail: "Game clock started",
          },
        ]
      : []),
    ...periodMarkers,
    ...game.history.map((event) => ({
      kind: "event" as const,
      id: event.id,
      atSeconds: event.atSeconds,
      displaySeconds: getMatchClockSeconds(game, event.atSeconds),
      order: 1,
      event,
    })),
  ].sort((a, b) => b.atSeconds - a.atSeconds || b.order - a.order);
  if (timelineItems.length === 0) return null;

  const eventIcon = (event: GameEvent) => {
    switch (event.type) {
      case "substitution":
        return <ArrowRightLeft size={18} aria-hidden="true" />;
      case "position-change":
        return <Move size={18} aria-hidden="true" />;
      case "goal-for":
      case "goal-against":
        return <SoccerBallIcon />;
      case "available":
        return <CirclePlus size={18} aria-hidden="true" />;
      case "unavailable":
        return <UserRoundX size={18} aria-hidden="true" />;
    }
  };

  return (
    <details className={`game-log ${followsRoster ? "follows-roster" : ""}`}>
      <summary className="disclosure-summary">
        <span>
          <strong>Game timeline</strong>
          <small>Review periods and confirmed game changes</small>
        </span>
        <span>{game.history.length} events</span>
      </summary>
      <div className="game-log-content">
        {timelineItems.length ? (
          <ol>
            {timelineItems.map((item) => {
              if (item.kind === "period") {
                return (
                  <li className="period-timeline-marker" key={item.id}>
                    <time>{formatDuration(item.displaySeconds)}</time>
                    <span className="timeline-event-icon" aria-hidden="true">
                      {completed && item.title === "Game ended" ? (
                        <Flag size={18} />
                      ) : (
                        <Clock3 size={18} />
                      )}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </li>
                );
              }
              const { event } = item;
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
              const positionChange =
                event.type === "position-change"
                  ? formatPositionChange(event, formation, team)
                  : null;
              const eventTitle =
                event.type === "goal-for"
                  ? `${eventPlayer ?? "Player"} scored`
                  : event.type === "goal-against"
                    ? "Opponent scored"
                    : event.type === "substitution"
                      ? `${event.pairs.length} substitution${event.pairs.length === 1 ? "" : "s"}`
                      : event.type === "position-change"
                        ? positionChange?.title
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
                      ? positionChange?.detail
                      : event.pairs.length
                        ? event.pairs
                            .map((pair) =>
                              pair.keeperHandoff
                                ? `${playerName(team, pair.outPlayerId)} out · ${playerName(
                                    team,
                                    pair.keeperHandoff.playerId,
                                  )} to GK · ${playerName(
                                    team,
                                    pair.inPlayerId,
                                  )} in`
                                : `${playerName(
                                    team,
                                    pair.outPlayerId,
                                  )} → ${playerName(team, pair.inPlayerId)}`,
                            )
                            .join(" · ")
                        : event.note;
              return (
                <li key={event.id}>
                  <time>
                    {formatDuration(
                      getMatchClockSeconds(game, event.atSeconds),
                    )}
                  </time>
                  <span
                    className={`timeline-event-icon timeline-event-${event.type}`}
                    aria-hidden="true"
                  >
                    {eventIcon(event)}
                  </span>
                  <span>
                    <strong>{eventTitle}</strong>
                    <small>{eventDetail}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty-copy">But first there have to be some changes.</p>
        )}
        {onUndo && game.history.length > 0 && (
          <Button
            className="secondary-action game-log-undo"
            variant="default"
            size="large"
            leadingVisual={RotateCcw}
            onClick={onUndo}
          >
            Undo last change
          </Button>
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
  const currentPair = game.queuedSubstitutions?.find(
    (pair) => pair.outPlayerId === playerId,
  );
  const targetPositions = formation.positions.filter(
    (position) => game.assignments[position.id] !== playerId,
  );
  const [positionId, setPositionId] = useState("");
  const selectedPosition = formation.positions.find(
    (position) => position.id === positionId,
  );
  const selectedOccupant = positionId
    ? game.assignments[positionId]
    : undefined;
  const confirmLabel = selectedOccupant
    ? `Swap with ${playerName(team, selectedOccupant)}`
    : selectedPosition
      ? `Move to ${selectedPosition.shortLabel}`
      : "Choose a position";
  const confirmAccessibleLabel = selectedOccupant
    ? `Swap ${playerName(team, playerId)} with ${playerName(
        team,
        selectedOccupant,
      )}`
    : selectedPosition
      ? `Move ${playerName(team, playerId)} to ${selectedPosition.label}`
      : "Choose a position";

  return (
    <SidelineDialog
      title={playerDialogTitle(team, playerId, "Change position")}
      description="Position changes do not count as substitutions. You can also drag players directly on the field."
      className="compact-sheet"
      onClose={onClose}
      footer={
        <Button
          className="primary-action"
          variant="primary"
          size="large"
          leadingVisual={Check}
          aria-label={confirmAccessibleLabel}
          disabled={!positionId}
          onClick={() => onConfirm(playerId, positionId)}
        >
          {confirmLabel}
        </Button>
      }
    >
      <PlayerContextPanel
        items={[
          {
            label: "Position",
            value: selectedPosition ? (
              <span
                className="position-change-preview"
                aria-label={`Position changing from ${
                  currentPosition?.label ?? "Open"
                } to ${selectedPosition.label}`}
              >
                <span>{currentPosition?.label ?? "Open"}</span>
                <ArrowRightLeft size={15} aria-hidden="true" />
                <span className="position-change-destination">
                  {selectedPosition.shortLabel}
                </span>
              </span>
            ) : (
              (currentPosition?.label ?? "Open")
            ),
          },
          {
            label: "Played",
            value: formatPlayerDuration(
              game.totals[playerId]?.fieldSeconds ?? 0,
              "Not played yet",
            ),
          },
          {
            label: "Playing now",
            value: formatPlayerDuration(getCurrentFieldSeconds(game, playerId)),
          },
          {
            label: "Goals",
            value: (
              <PlayerGoalSummary
                label={playerName(team, playerId)}
                goalCount={playerGoalCount(game, playerId)}
              />
            ),
          },
          ...(currentPair
            ? [
                {
                  label: "In this plan",
                  value: `Scheduled out for ${playerName(
                    team,
                    currentPair.inPlayerId,
                  )}`,
                  emphasis: "warm" as const,
                  wide: true,
                },
              ]
            : []),
        ]}
      />
      <div className="bench-replacement-list position-swap-list">
        {targetPositions.map((position) => {
          const occupant = game.assignments[position.id];
          const label = occupant ? playerName(team, occupant) : "Open";
          const selected = positionId === position.id;
          return (
            <button
              className={`position-destination-choice ${
                selected ? "selected" : ""
              }`}
              type="button"
              key={position.id}
              aria-label={`${label} (${position.label})`}
              aria-pressed={selected}
              onClick={() => setPositionId(position.id)}
            >
              <span className="position-destination-heading">
                <strong className="replacement-position-primary">
                  {position.label}
                </strong>
                {selected && (
                  <Check
                    className="replacement-selected-icon"
                    size={15}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="replacement-player-secondary position-destination-player">
                {occupant ? (
                  <GoalMarkedPlayerName
                    label={playerName(team, occupant)}
                    number={
                      team.roster.find((player) => player.id === occupant)
                        ?.number
                    }
                    goalCount={playerGoalCount(game, occupant)}
                  />
                ) : (
                  "Unoccupied position"
                )}
              </span>
              {occupant && (
                <span className="replacement-player-times replacement-player-times-wide">
                  <span>
                    <span>Playing</span>
                    <strong>
                      {formatPlayerDuration(
                        getCurrentFieldSeconds(game, occupant),
                      )}
                    </strong>
                  </span>
                  <span>
                    <span>Total</span>
                    <strong>
                      {formatPlayerDuration(
                        game.totals[occupant]?.fieldSeconds ?? 0,
                        "Not played yet",
                      )}
                    </strong>
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </SidelineDialog>
  );
}

function ConfirmSheet({
  title,
  body,
  cancelLabel = "Continue game",
  confirmLabel,
  confirmIcon = <Square size={18} aria-hidden="true" />,
  confirmClassName = "danger-action",
  showClose = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmIcon?: ElementType | ReactElement;
  confirmClassName?: "primary-action" | "danger-action";
  showClose?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <SidelineDialog
      title={title}
      description={body}
      className="confirm-sheet"
      width="480px"
      role="alertdialog"
      showClose={showClose}
      onClose={onCancel}
      footer={
        <>
          <Button
            className="secondary-action"
            variant="default"
            size="large"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            className={confirmClassName}
            variant={
              confirmClassName === "danger-action" ? "danger" : "primary"
            }
            size="large"
            leadingVisual={confirmIcon}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
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
      <Button
        className="primary-action"
        variant="primary"
        size="large"
        trailingVisual={ArrowRightLeft}
        onClick={onAction}
      >
        {action}
      </Button>
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
  mini = false,
}: {
  teamId: TeamId;
  compact?: boolean;
  mini?: boolean;
}) {
  const sizeClass = mini ? "mini" : compact ? "compact" : "";
  if (teamId === "u8") {
    return (
      <svg
        className={`team-crest golden-dragons ${sizeClass}`}
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
          d="M32 23c-2 1-3 3-4 6l-8-8-5-1 3 6 4-1-1 7-9 3 8 6c1 3 4 5 7 6l-3 6h16l-3-6c3-1 6-3 7-6l8-6-9-3-1-7 4 1 3-6-5 1-8 8c-1-3-2-5-4-6Z"
          fill="#0b6b63"
          stroke="#10282c"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="m24 37 5 1-4 2-1-3Zm16 0-5 1 4 2 1-3ZM29 47l2-1-1 2-1-1Zm6 0-2-1 1 2 1-1Z"
          fill="#f2c94c"
        />
        <text
          x="32"
          y="16"
          fill="#10282c"
          fontSize="9"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
        >
          U8
        </text>
      </svg>
    );
  }

  return (
    <svg
      className={`team-crest fireballers ${sizeClass}`}
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
