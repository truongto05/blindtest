import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import * as clipboard from "../services/clipboard";
import type { Playlist, PublicPlaylist } from "../types/game";
import PlaylistDetail from "./PlaylistDetail";
import Playlists from "./Playlists";
import PublicPlaylists from "./PublicPlaylists";
import SharedPlaylist from "./SharedPlaylist";

const ownerId = "LIB-TEST-12345678";
const shareId = "x8T4pKTnER_Q3saOavVAwrDXB5u_C0G2";
const playlist: Playlist = {
  id: "af23b526-121e-4dd2-9449-e00fca0db88e",
  name: "Les classiques du vendredi",
  visibility: "PRIVATE",
  shareId: null,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:00:00.000Z",
  trackCount: 1,
  playableTrackCount: 1,
  tracks: [
    {
      deezerId: "42",
      title: "One More Time",
      artist: "Daft Punk",
      coverUrl: "",
      previewUrl: "https://example.com/preview.mp3",
    },
  ],
};
const shared: PublicPlaylist = {
  name: playlist.name,
  visibility: "UNLISTED",
  shareId,
  createdAt: playlist.createdAt,
  updatedAt: playlist.updatedAt,
  tracks: playlist.tracks,
  trackCount: 1,
  playableTrackCount: 1,
};

function Location() {
  const location = useLocation();
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
    </p>
  );
}

function renderPage(page: ReactElement, initial = "/playlists") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Location />
      <Routes>
        <Route path="*" element={page} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("playlist library and sharing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("shows owner playlists with visibility, counts and direct detail links", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([playlist]);
    renderPage(
      <Playlists ownerId={ownerId} onRestoreOwner={vi.fn()} notify={vi.fn()} />,
    );
    const card = await screen.findByRole("link", {
      name: /les classiques du vendredi/i,
    });
    expect(card).toHaveAttribute("href", `/playlists/${playlist.id}`);
    expect(within(card).getByText("Privée")).toBeVisible();
    expect(within(card).getByText("1 titre")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /playlists publiques/i }),
    ).toHaveAttribute("href", "/playlists/public");
  });

  it("creates a private playlist and opens its detail URL", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([]);
    const create = vi.spyOn(api, "createPlaylist").mockResolvedValue({
      ...playlist,
      tracks: [],
      trackCount: 0,
      playableTrackCount: 0,
    });
    renderPage(
      <Playlists ownerId={ownerId} onRestoreOwner={vi.fn()} notify={vi.fn()} />,
    );
    expect(await screen.findByText(/ta première playlist/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/créer une playlist/i), {
      target: { value: "  Vendredi  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^créer$/i }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(ownerId, "Vendredi"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/playlists/${playlist.id}`,
      ),
    );
  });

  it("distinguishes a server error from an empty library and lets the visitor retry", async () => {
    const list = vi
      .spyOn(api, "playlists")
      .mockRejectedValueOnce(
        new Error("Bibliothèque temporairement indisponible."),
      )
      .mockResolvedValueOnce([]);
    renderPage(
      <Playlists ownerId={ownerId} onRestoreOwner={vi.fn()} notify={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /temporairement indisponible/i,
    );
    expect(screen.queryByText(/ta première playlist/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^réessayer$/i }));
    expect(await screen.findByText(/ta première playlist/i)).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("changes private to unlisted, copies the share URL and revokes it when private again", async () => {
    vi.spyOn(api, "ownerPlaylist").mockResolvedValue(playlist);
    const change = vi
      .spyOn(api, "setPlaylistVisibility")
      .mockResolvedValueOnce({ ...playlist, visibility: "UNLISTED", shareId })
      .mockResolvedValueOnce(playlist);
    const copy = vi.spyOn(clipboard, "copyText").mockResolvedValue(undefined);
    renderPage(
      <PlaylistDetail
        ownerId={ownerId}
        playlistId={playlist.id}
        notify={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^partager$/i }));
    const dialog = screen.getByRole("dialog", {
      name: /partager la playlist/i,
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: /^partagée par lien/i }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /enregistrer la visibilité/i,
      }),
    );
    const link = await within(dialog).findByLabelText(/lien de la playlist/i);
    expect(link).toHaveValue(`${window.location.origin}/p/${shareId}`);
    expect(change).toHaveBeenNthCalledWith(1, playlist.id, ownerId, "UNLISTED");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /copier le lien/i }),
    );
    await waitFor(() =>
      expect(copy).toHaveBeenCalledWith(
        `${window.location.origin}/p/${shareId}`,
      ),
    );
    expect(
      await within(dialog).findByRole("button", { name: /lien copié/i }),
    ).toBeVisible();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^privée/i }));
    expect(
      within(dialog).getByText(/l’ancien lien cessera de fonctionner/i),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /enregistrer la visibilité/i,
      }),
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByLabelText(/lien de la playlist/i),
      ).not.toBeInTheDocument(),
    );
    expect(change).toHaveBeenNthCalledWith(2, playlist.id, ownerId, "PRIVATE");
  });

  it("keeps the link selectable when clipboard access fails", async () => {
    vi.spyOn(api, "ownerPlaylist").mockResolvedValue({
      ...playlist,
      visibility: "PUBLIC",
      shareId,
    });
    vi.spyOn(clipboard, "copyText").mockRejectedValue(
      new Error(
        "Copie automatique indisponible. Sélectionne le lien ou le code pour le copier.",
      ),
    );
    renderPage(
      <PlaylistDetail
        ownerId={ownerId}
        playlistId={playlist.id}
        notify={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^partager$/i }));
    fireEvent.click(screen.getByRole("button", { name: /copier le lien/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /copie automatique indisponible/i,
    );
    expect(screen.getByLabelText(/lien de la playlist/i)).toHaveValue(
      `${window.location.origin}/p/${shareId}`,
    );
  });

  it("clears the shared-link fallback after a successful clipboard retry", async () => {
    vi.spyOn(api, "sharedPlaylist").mockResolvedValue(shared);
    vi.spyOn(clipboard, "copyText")
      .mockRejectedValueOnce(new Error("Copie automatique indisponible."))
      .mockResolvedValueOnce(undefined);
    const notify = vi.fn();
    renderPage(
      <SharedPlaylist ownerId={ownerId} shareId={shareId} notify={notify} />,
    );
    const copy = await screen.findByRole("button", { name: /copier le lien/i });
    fireEvent.click(copy);
    expect(await screen.findByRole("alert")).toHaveTextContent(/indisponible/i);
    expect(screen.getByLabelText(/lien à copier/i)).toHaveValue(
      `${window.location.origin}/p/${shareId}`,
    );
    fireEvent.click(copy);
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Lien copié."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/lien à copier/i)).not.toBeInTheDocument();
  });

  it("keeps a failed visibility choice open so it can be retried", async () => {
    vi.spyOn(api, "ownerPlaylist").mockResolvedValue(playlist);
    const change = vi
      .spyOn(api, "setPlaylistVisibility")
      .mockRejectedValueOnce(new Error("Partage indisponible pour le moment."))
      .mockResolvedValueOnce({ ...playlist, visibility: "PUBLIC", shareId });
    renderPage(
      <PlaylistDetail
        ownerId={ownerId}
        playlistId={playlist.id}
        notify={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /^partager$/i }));
    fireEvent.click(screen.getByRole("radio", { name: /^publique/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /enregistrer la visibilité/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /partage indisponible/i,
    );
    expect(
      screen.queryByLabelText(/lien de la playlist/i),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /enregistrer la visibilité/i }),
    );
    expect(await screen.findByLabelText(/lien de la playlist/i)).toBeVisible();
    expect(change).toHaveBeenCalledTimes(2);
  });

  it("restores focus and scrolling when a sharing dialog is closed with Escape", async () => {
    vi.spyOn(api, "ownerPlaylist").mockResolvedValue(playlist);
    renderPage(
      <PlaylistDetail
        ownerId={ownerId}
        playlistId={playlist.id}
        notify={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    const trigger = await screen.findByRole("button", { name: /^partager$/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("requires confirmation for removing a track and retains the dialog on failure", async () => {
    vi.spyOn(api, "ownerPlaylist")
      .mockResolvedValueOnce(playlist)
      .mockResolvedValueOnce({
        ...playlist,
        tracks: [],
        trackCount: 0,
        playableTrackCount: 0,
      });
    const remove = vi
      .spyOn(api, "removeTrack")
      .mockRejectedValueOnce(new Error("Retrait impossible pour le moment."))
      .mockResolvedValueOnce(undefined);
    renderPage(
      <PlaylistDetail
        ownerId={ownerId}
        playlistId={playlist.id}
        notify={vi.fn()}
        onPlay={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /retirer one more time/i }),
    );
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^retirer$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /retrait impossible/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /^retirer$/i }));
    expect(
      await screen.findByText(/cette playlist attend ses morceaux/i),
    ).toBeVisible();
    expect(remove).toHaveBeenLastCalledWith(playlist.id, ownerId, "42");
  });

  it("opens a shared playlist without owner access and creates an independent copy", async () => {
    const publicRead = vi
      .spyOn(api, "sharedPlaylist")
      .mockResolvedValue(shared);
    const ownerRead = vi.spyOn(api, "ownerPlaylist");
    const duplicate = vi
      .spyOn(api, "duplicatePlaylist")
      .mockResolvedValue({ ...playlist, id: "independent-copy" });
    const notify = vi.fn();
    renderPage(
      <SharedPlaylist ownerId={ownerId} shareId={shareId} notify={notify} />,
      `/p/${shareId}`,
    );
    expect(
      await screen.findByRole("heading", { name: playlist.name }),
    ).toBeVisible();
    const audio = screen.getByLabelText(/extrait de one more time/i);
    expect(audio).toBeVisible();
    expect(audio).toHaveAttribute("controls");
    expect(
      screen.queryByRole("button", { name: /retirer/i }),
    ).not.toBeInTheDocument();
    expect(publicRead).toHaveBeenCalledWith(shareId);
    expect(ownerRead).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: /ajouter à ma bibliothèque/i }),
    );
    await waitFor(() =>
      expect(duplicate).toHaveBeenCalledWith(shareId, ownerId),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/playlists/independent-copy",
      ),
    );
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/copie privée/i));
  });

  it("renders a missing share as an error without offering unavailable actions", async () => {
    vi.spyOn(api, "sharedPlaylist").mockRejectedValue(
      new Error("Cette playlist n’est plus partagée ou n’existe pas."),
    );
    renderPage(
      <SharedPlaylist ownerId={ownerId} shareId={shareId} notify={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /n’est plus partagée/i,
    );
    expect(
      screen.queryByRole("button", { name: /ajouter à ma bibliothèque/i }),
    ).not.toBeInTheDocument();
  });

  it("loads public catalogue pages through the URL and gives an explicit empty state", async () => {
    const list = vi
      .spyOn(api, "publicPlaylists")
      .mockResolvedValueOnce({
        items: [{ ...shared, visibility: "PUBLIC" }],
        page: 1,
        pageSize: 12,
        total: 13,
      })
      .mockResolvedValueOnce({ items: [], page: 2, pageSize: 12, total: 13 });
    renderPage(<PublicPlaylists />, "/playlists/public");
    expect(
      await screen.findByRole("link", { name: /les classiques du vendredi/i }),
    ).toHaveAttribute("href", `/p/${shareId}`);
    fireEvent.click(screen.getByRole("button", { name: /suivante/i }));
    expect(
      await screen.findByText(/aucune playlist sur cette page/i),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("?page=2");
    expect(list).toHaveBeenNthCalledWith(2, 2);
    expect(screen.getByRole("button", { name: /précédente/i })).toBeEnabled();
  });
});
