import type {
  Playlist,
  PlaylistSource,
  PlaylistVisibility,
  PublicPlaylist,
  PublicPlaylistPage,
  QuizData,
  Settings,
  Track,
} from "../types/game";
import type {
  AccountData,
  FriendsData,
  RoomInvitation,
} from "../types/account";
import { accessToken } from "./auth";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit,
  timeout = 12_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  const headers = new Headers(options?.headers);
  if (options?.body) headers.set("Content-Type", "application/json");
  try {
    const token = await accessToken().catch(() => {
      throw new ApiError(
        "Ta session a expiré. Reconnecte-toi à ton compte.",
        401,
      );
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new ApiError(
        body.error || "Cette action est momentanément impossible.",
        response.status,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  } catch (error) {
    if (controller.signal.aborted)
      throw new ApiError(
        "Le serveur met trop de temps à répondre. Réessaie dans un instant.",
        408,
      );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.",
      0,
    );
  } finally {
    window.clearTimeout(timer);
  }
}

const ownerHeaders = (ownerId: string) => ({ "X-Library-Id": ownerId });
const playlistPath = (id: string) => `/api/playlists/${encodeURIComponent(id)}`;

export const api = {
  account: () => request<AccountData>("/api/account/me"),
  saveProfile: (displayName: string) =>
    request<AccountData>("/api/account/me", {
      method: "PUT",
      body: JSON.stringify({ displayName }),
    }),
  importLibrary: (ownerId: string) =>
    request<{ importedCount: number; alreadyImported: boolean }>(
      "/api/account/import-library",
      { method: "POST", body: JSON.stringify({ ownerId }) },
    ),
  friends: () => request<FriendsData>("/api/account/friends"),
  requestFriend: (friendCode: string) =>
    request<void>("/api/account/friends/requests", {
      method: "POST",
      body: JSON.stringify({ friendCode }),
    }),
  acceptFriend: (id: string) =>
    request<void>(
      `/api/account/friends/requests/${encodeURIComponent(id)}/accept`,
      { method: "POST" },
    ),
  dismissFriend: (id: string) =>
    request<void>(`/api/account/friends/requests/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  removeFriend: (id: string) =>
    request<void>(`/api/account/friends/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  invitations: () =>
    request<{ invitations: RoomInvitation[] }>("/api/account/invitations"),
  inviteFriend: (friendId: string, roomCode: string, playerToken: string) =>
    request<void>("/api/account/invitations", {
      method: "POST",
      body: JSON.stringify({ friendId, roomCode, playerToken }),
    }),
  dismissInvitation: (id: string) =>
    request<void>(`/api/account/invitations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  nextQuiz(
    settings: Settings,
    playedIds: Array<string | number>,
    ownerId?: string,
    run?: { id: string; recentIds: Array<string | number> },
  ) {
    const query = new URLSearchParams({
      genre: settings.genre,
      type: settings.answerType,
      gameType: settings.gameType,
      playedIds: playedIds.join(","),
      customPlaylistUrl: settings.customPlaylistUrl,
      playlistId: settings.pulsePlaylistId,
      rounds: String(settings.rounds),
      answerMode: settings.answerMode,
    });
    if (run && settings.gameType === "music") {
      query.set("runId", run.id);
      query.set("recentIds", run.recentIds.slice(-60).join(","));
    }
    return request<QuizData>(
      `/api/quiz/next?${query}`,
      {
        headers:
          settings.genre === "pulse" && ownerId
            ? { "X-Library-Id": ownerId }
            : {},
      },
      35_000,
    );
  },
  quizSource(playlistId: string, ownerId: string, settings: Settings) {
    const query = new URLSearchParams({
      playlistId,
      rounds: String(settings.rounds),
      answerType: settings.answerType,
      answerMode: settings.answerMode,
    });
    return request<PlaylistSource>(`/api/quiz/source?${query}`, {
      headers: { "X-Library-Id": ownerId },
    });
  },
  playlists(ownerId: string) {
    return request<Playlist[]>("/api/playlists", {
      headers: ownerHeaders(ownerId),
    });
  },
  ownerPlaylist(id: string, ownerId: string) {
    return request<Playlist>(playlistPath(id), {
      headers: ownerHeaders(ownerId),
    });
  },
  createPlaylist(ownerId: string, name: string) {
    return request<Playlist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify({ ownerId, name }),
    });
  },
  renamePlaylist(id: string, ownerId: string, name: string) {
    return request<void>(playlistPath(id), {
      method: "PATCH",
      body: JSON.stringify({ ownerId, name }),
    });
  },
  deletePlaylist(id: string, ownerId: string) {
    return request<void>(playlistPath(id), {
      method: "DELETE",
      headers: ownerHeaders(ownerId),
    });
  },
  addTrack(id: string, ownerId: string, track: Track) {
    return request<void>(`${playlistPath(id)}/tracks`, {
      method: "POST",
      body: JSON.stringify({ ownerId, ...track }),
    });
  },
  removeTrack(id: string, ownerId: string, trackId: string) {
    return request<void>(
      `${playlistPath(id)}/tracks/${encodeURIComponent(trackId)}`,
      { method: "DELETE", headers: ownerHeaders(ownerId) },
    );
  },
  setPlaylistVisibility(
    id: string,
    ownerId: string,
    visibility: PlaylistVisibility,
  ) {
    return request<Playlist>(`${playlistPath(id)}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ ownerId, visibility }),
    });
  },
  sharedPlaylist(shareId: string) {
    return request<PublicPlaylist>(
      `/api/playlists/share/${encodeURIComponent(shareId)}`,
    );
  },
  publicPlaylists(page = 1) {
    return request<PublicPlaylistPage>(
      `/api/playlists/public?page=${page}&limit=12`,
    );
  },
  duplicatePlaylist(shareId: string, ownerId: string) {
    return request<Playlist>(
      `/api/playlists/share/${encodeURIComponent(shareId)}/copy`,
      { method: "POST", body: JSON.stringify({ ownerId }) },
    );
  },
  search(query: string, type: string) {
    return request<string[]>(
      `/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`,
      undefined,
      6_000,
    );
  },
};
