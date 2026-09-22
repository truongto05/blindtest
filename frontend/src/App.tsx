import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import AccessibilityPanel from "./components/AccessibilityPanel";
import Brand from "./components/Brand";
import ConnectionNotice from "./components/ConnectionNotice";
import GameBoard from "./components/GameBoard";
import { PageLoading, PageNotFound } from "./components/ui/PageState";
import Toast from "./components/ui/Toast";
import { useRoom } from "./features/game/useRoom";
import { useToast } from "./hooks/useToast";
import EndScreen from "./pages/EndScreen";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import SettingsPage from "./pages/Settings";
import { GENRES } from "./domain/settings";
import { applyHomeSelection, selectedHomeSelection } from "./domain/selections";
import { storage } from "./services/storage";
import { useAccount } from "./features/account/useAccount";
import {
  DEFAULT_SETTINGS,
  type Playlist,
  type QuizData,
  type Settings,
} from "./types/game";

const Playlists = lazy(() => import("./pages/Playlists"));
const PlaylistDetail = lazy(() => import("./pages/PlaylistDetail"));
const SharedPlaylist = lazy(() => import("./pages/SharedPlaylist"));
const PublicPlaylists = lazy(() => import("./pages/PublicPlaylists"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const Account = lazy(() => import("./pages/Account"));
const Friends = lazy(() => import("./pages/Friends"));

function initialSettings(): Settings {
  try {
    const saved = JSON.parse(
      storage.get("pulse_settings") || "{}",
    ) as Partial<Settings> | null;
    if (!saved || typeof saved !== "object") return { ...DEFAULT_SETTINGS };
    const numberInRange = (
      value: unknown,
      min: number,
      max: number,
      fallback: number,
    ) =>
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= min &&
      value <= max
        ? value
        : fallback;
    return {
      mode:
        saved.mode === "progressive" && saved.gameType === "music"
          ? "progressive"
          : "classic",
      rounds: numberInRange(saved.rounds, 1, 30, DEFAULT_SETTINGS.rounds),
      timeLimit: numberInRange(
        saved.timeLimit,
        5,
        60,
        DEFAULT_SETTINGS.timeLimit,
      ),
      genre: GENRES.some(([value]) => value === saved.genre)
        ? saved.genre!
        : "all",
      answerType:
        saved.answerType &&
        ["random", "both", "artist", "title"].includes(saved.answerType)
          ? saved.answerType
          : "random",
      answerMode: saved.answerMode === "input" ? "input" : "choices",
      gameType:
        saved.gameType &&
        ["music", "movie", "series", "screen"].includes(saved.gameType)
          ? saved.gameType
          : "music",
      pulsePlaylistId:
        typeof saved.pulsePlaylistId === "string"
          ? saved.pulsePlaylistId.slice(0, 36)
          : "",
      customPlaylistUrl:
        typeof saved.customPlaylistUrl === "string"
          ? saved.customPlaylistUrl.slice(0, 500)
          : "",
      showPoster: saved.showPoster !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, notify } = useToast();
  const account = useAccount();
  const [username, setUsername] = useState(
    () => storage.get("pulse_username") || "",
  );
  const [guestOwnerId, setOwnerId] = useState(
    () =>
      storage.get("pulse_library_id") ||
      `LIB-${crypto.randomUUID().toUpperCase()}`,
  );
  const [settings, setSettings] = useState(initialSettings);
  const [solo, setSolo] = useState<{
    score: number;
    history: QuizData[];
  } | null>(null);
  const [soloStarted, setSoloStarted] = useState(false);
  const game = useRoom(username, notify);
  const previousAccount = useRef<string | null | undefined>(undefined);
  const leaveRef = useRef(game.leave);
  useLayoutEffect(() => {
    leaveRef.current = game.leave;
  }, [game.leave]);
  useEffect(() => {
    if (account.initializing) return;
    const identity = account.session?.user.id || null;
    if (
      previousAccount.current !== undefined &&
      previousAccount.current !== identity
    ) {
      setSolo(null);
      setSoloStarted(false);
      if (game.room || ["/play", "/results"].includes(location.pathname))
        leaveRef.current();
    }
    previousAccount.current = identity;
  }, [
    account.initializing,
    account.session?.user.id,
    game.room,
    location.pathname,
  ]);
  const ownerId = account.initializing
    ? ""
    : account.session
      ? account.profile?.id === account.session.user.id
        ? account.libraryOwnerId || ""
        : ""
      : guestOwnerId;
  const libraryGate = (
    <main id="main-content" className="page max-w-2xl">
      <h1 className="text-2xl font-bold">Retrouver ta bibliothèque</h1>
      <p className="mt-3 text-zinc-400">
        {account.initializing || account.loading
          ? "Connexion à ton compte…"
          : "Ouvre ton compte pour terminer ton profil ou rétablir la connexion."}
      </p>
      <Link className="btn-primary mt-5" to="/compte">
        Mon compte
      </Link>
    </main>
  );

  useEffect(() => {
    if (account.profile?.id === account.session?.user.id && account.profile)
      setUsername(account.profile.displayName);
  }, [
    account.profile?.id,
    account.profile?.displayName,
    account.session?.user.id,
  ]);

  useEffect(() => {
    if (location.pathname !== "/play") setSoloStarted(false);
  }, [location.pathname]);

  useEffect(() => {
    if (
      game.room &&
      location.pathname === `/rooms/${game.room.roomCode}/settings`
    )
      setSettings(game.room.settings);
  }, [game.room?.roomCode, location.pathname]);

  useEffect(() => {
    storage.set("pulse_library_id", guestOwnerId);
  }, [guestOwnerId]);
  useEffect(() => {
    storage.set("pulse_settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    storage.set("pulse_username", username.trim());
  }, [username]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      main?.setAttribute("tabindex", "-1");
      main?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  const playPlaylist = (playlist: Playlist) => {
    setSettings((previous) => ({
      ...previous,
      gameType: "music",
      genre: "pulse",
      pulsePlaylistId: playlist.id,
      answerType: "title",
      answerMode: playlist.playableTrackCount >= 4 ? "choices" : "input",
      rounds: Math.max(
        1,
        Math.min(previous.rounds, playlist.playableTrackCount),
      ),
    }));
    navigate("/settings");
  };
  const leave = () => {
    game.leave();
  };
  const configure = (kind: "solo" | "create" | "edit") => (
    <SettingsPage
      key={kind}
      settings={settings}
      setSettings={setSettings}
      ownerId={ownerId}
      isMultiplayer={kind !== "solo"}
      isEditing={kind === "edit"}
      pending={Boolean(game.pending)}
      multiplayerConnected={game.connection === "connected"}
      onBack={() =>
        navigate(
          kind === "edit" && game.room ? `/rooms/${game.room.roomCode}` : "/",
        )
      }
      onSave={() => {
        if (kind === "create") game.create(settings, ownerId);
        else if (kind === "edit") game.updateSettings(settings, ownerId);
        else {
          setSolo(null);
          setSoloStarted(true);
          navigate("/play");
        }
      }}
    />
  );
  const endScreen = (multiplayer: boolean) => (
    <EndScreen
      score={multiplayer ? game.me?.score || 0 : solo?.score || 0}
      history={multiplayer ? game.history : solo?.history || []}
      players={multiplayer ? game.room?.players || [] : []}
      playerId={game.playerId}
      ownerId={ownerId}
      notify={notify}
      canReplay={!multiplayer || Boolean(game.me?.isHost)}
      onReplay={() =>
        multiplayer ? game.command("return_to_lobby") : navigate("/settings")
      }
      onHome={leave}
    />
  );
  const board = (multiplayer: boolean) => (
    <GameBoard
      settings={multiplayer && game.room ? game.room.settings : settings}
      ownerId={ownerId}
      isMultiplayer={multiplayer}
      room={multiplayer ? game.room : null}
      playerId={game.playerId}
      round={multiplayer ? game.round : null}
      reveal={multiplayer ? game.reveal : null}
      connection={game.connection}
      onSubmitMulti={game.submit}
      onRequestSegment={game.requestSegment}
      onSoloEnd={(score, history) => {
        setSolo({ score, history });
        navigate("/results", { replace: true });
      }}
      onExit={leave}
    />
  );
  const routeRoomCode = /^\/rooms\/([A-Z0-9]{6})(?:\/|$)/.exec(
    location.pathname,
  )?.[1];
  const roomPage =
    !game.room || game.room.roomCode !== routeRoomCode ? (
      <PageLoading
        title="Connexion au salon"
        text={
          game.connection === "connected"
            ? "Nous retrouvons ta place…"
            : game.connection === "offline"
              ? "Tu es hors connexion. Nous réessaierons au retour du réseau."
              : "Connexion en cours. Si le serveur démarre, cela peut prendre un moment. La reconnexion est automatique."
        }
      />
    ) : game.room.phase === "finished" ? (
      endScreen(true)
    ) : game.room.phase !== "lobby" ? (
      board(true)
    ) : (
      <Lobby
        room={game.room}
        me={game.me}
        connection={game.connection}
        onBack={leave}
        onConfigure={() => {
          setSettings(game.room!.settings);
          navigate(`/rooms/${game.room!.roomCode}/settings`);
        }}
        onToggleReady={() => game.command("toggle_ready")}
        onInviteFriends={() => navigate("/amis")}
        onStart={() => game.command("start_game")}
        onKick={game.kick}
      />
    );

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>
      <Toast toast={toast} />
      {(location.pathname === "/" ||
        location.pathname === "/rooms/new" ||
        location.pathname === "/settings") && (
        <ConnectionNotice
          state={game.connection}
          onRetry={game.retryConnection}
        />
      )}
      {game.pending && (
        <div
          role="status"
          className="fixed inset-x-4 top-3 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-beat-400/30 bg-ink-800 px-5 py-3 text-center text-sm text-beat-200"
        >
          {game.pending === "create"
            ? "Création du salon…"
            : game.pending === "settings"
              ? "Enregistrement des réglages…"
              : game.pending === "start"
                ? "Vérification de la playlist et démarrage…"
                : "Connexion au salon…"}
        </div>
      )}
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route
            path="/compte"
            element={
              <Account
                key={account.session?.user.id || "guest"}
                account={account}
                guestOwnerId={guestOwnerId}
                onSignedOut={leave}
              />
            }
          />
          <Route
            path="/compte/reinitialiser"
            element={
              <Account
                account={account}
                guestOwnerId={guestOwnerId}
                onSignedOut={leave}
              />
            }
          />
          <Route
            path="/amis"
            element={
              <Friends
                key={account.session?.user.id || "guest"}
                account={account}
                currentRoom={game.room}
                playerToken={game.playerToken}
              />
            }
          />
          <Route
            path="/"
            element={
              <Home
                accountName={account.profile?.displayName}
                settings={settings}
                onSelect={(id) =>
                  setSettings((previous) => applyHomeSelection(previous, id))
                }
                onQuickPlay={() => {
                  if (
                    game.connection !== "connected" ||
                    game.pending ||
                    !selectedHomeSelection(settings)
                  )
                    return;
                  setSolo(null);
                  setSoloStarted(true);
                  navigate("/play");
                }}
                pending={Boolean(game.pending)}
                canJoin={game.connection === "connected"}
                username={username}
                setUsername={setUsername}
                onCreate={(name) => {
                  setUsername(name.trim());
                  navigate("/rooms/new");
                }}
                onJoin={(code, name) => {
                  setUsername(name.trim());
                  game.join(code, name);
                }}
                onSolo={() => navigate("/settings")}
                onPlaylists={() => navigate("/playlists")}
              />
            }
          />
          <Route path="/settings" element={configure("solo")} />
          <Route
            path="/rooms/new"
            element={
              username.trim().length >= 2 ? (
                configure("create")
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/rooms/:code"
            element={<RoomRoute>{roomPage}</RoomRoute>}
          />
          <Route
            path="/rooms/:code/settings"
            element={
              <RoomRoute>
                {!game.room || game.room.roomCode !== routeRoomCode ? (
                  roomPage
                ) : game.me?.isHost && game.room.phase === "lobby" ? (
                  configure("edit")
                ) : (
                  <Navigate to={`/rooms/${game.room.roomCode}`} replace />
                )}
              </RoomRoute>
            }
          />
          <Route
            path="/play"
            element={
              soloStarted ? board(false) : <Navigate to="/settings" replace />
            }
          />
          <Route
            path="/results"
            element={
              solo ? endScreen(false) : <Navigate to="/settings" replace />
            }
          />
          <Route
            path="/playlists"
            element={
              ownerId ? (
                <Playlists
                  key={ownerId}
                  accountLinked={Boolean(account.session)}
                  ownerId={ownerId}
                  onRestoreOwner={setOwnerId}
                  notify={notify}
                />
              ) : (
                libraryGate
              )
            }
          />
          <Route path="/playlists/public" element={<PublicPlaylists />} />
          <Route
            path="/playlists/:id"
            element={
              ownerId ? (
                <PlaylistRoute
                  key={ownerId}
                  ownerId={ownerId}
                  notify={notify}
                  onPlay={playPlaylist}
                />
              ) : (
                libraryGate
              )
            }
          />
          <Route
            path="/p/:shareId"
            element={<SharedRoute ownerId={ownerId} notify={notify} />}
          />
          <Route
            path="/confidentialite"
            element={<LegalPage kind="privacy" />}
          />
          <Route path="/cookies" element={<LegalPage kind="cookies" />} />
          <Route path="/conditions" element={<LegalPage kind="terms" />} />
          <Route
            path="/mentions-legales"
            element={<LegalPage kind="legal" />}
          />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
      <footer
        className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-5 gap-y-1 px-5 pb-4 text-xs text-zinc-400"
        aria-label="Informations sur Pulse"
      >
        <Link
          className="mr-auto inline-flex min-h-11 items-center"
          to="/"
          aria-label="Pulse — accueil"
        >
          <Brand />
        </Link>
        <Link
          className="inline-flex min-h-11 items-center hover:text-white"
          to="/mentions-legales"
        >
          Mentions légales
        </Link>
        <Link
          className="inline-flex min-h-11 items-center hover:text-white"
          to="/confidentialite"
        >
          Confidentialité
        </Link>
        <Link
          className="inline-flex min-h-11 items-center hover:text-white"
          to="/cookies"
        >
          Stockage & cookies
        </Link>
        <Link
          className="inline-flex min-h-11 items-center hover:text-white"
          to="/conditions"
        >
          Conditions d’utilisation
        </Link>
        <AccessibilityPanel />
      </footer>
    </div>
  );
}

function RoomRoute({ children }: { children: ReactNode }) {
  const { code = "" } = useParams();
  return /^[A-Z0-9]{6}$/.test(code) ? children : <PageNotFound />;
}

function PlaylistRoute(
  props: Omit<Parameters<typeof PlaylistDetail>[0], "playlistId">,
) {
  const { id = "" } = useParams();
  return (
    <PlaylistDetail key={`${props.ownerId}:${id}`} {...props} playlistId={id} />
  );
}
function SharedRoute(
  props: Omit<Parameters<typeof SharedPlaylist>[0], "shareId">,
) {
  const { shareId = "" } = useParams();
  return <SharedPlaylist key={shareId} {...props} shareId={shareId} />;
}
