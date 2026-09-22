import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import type { Playlist, QuizData } from "../types/game";
import EndScreen from "./EndScreen";

const track: QuizData = {
  trackId: 42,
  audioUrl: "https://example.com/preview.mp3",
  choices: [],
  correctAnswer: "Daft Punk — One More Time",
  coverUrl: "",
  questionType: "both",
  artistName: "Daft Punk",
  trackTitle: "One More Time",
};
const secondTrack: QuizData = {
  ...track,
  trackId: 43,
  trackTitle: "Digital Love",
};
const playlist: Playlist = {
  id: "playlist-1",
  name: "Favoris",
  visibility: "PRIVATE",
  shareId: null,
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:00:00.000Z",
  tracks: [],
  trackCount: 0,
  playableTrackCount: 0,
};

function renderResults(history = [track]) {
  const props = {
    score: 1000,
    history,
    players: [],
    playerId: "player",
    ownerId: "LIB-TEST-12345678",
    notify: vi.fn(),
    canReplay: true,
    onReplay: vi.fn(),
    onHome: vi.fn(),
  };
  render(
    <MemoryRouter>
      <EndScreen {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe("EndScreen library actions", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("creates the first private playlist without leaving the results", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([]);
    const create = vi
      .spyOn(api, "createPlaylist")
      .mockResolvedValue({ ...playlist, name: "Découvertes" });
    const props = renderResults();
    fireEvent.change(
      await screen.findByLabelText(/nom de la nouvelle playlist/i),
      { target: { value: "Découvertes" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^créer$/i }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(props.ownerId, "Découvertes"),
    );
    expect(
      await screen.findByLabelText(/playlist de destination/i),
    ).toHaveValue(playlist.id);
    expect(
      screen.getByRole("link", { name: /ma bibliothèque/i }),
    ).toHaveAttribute("href", "/playlists");
  });

  it("also offers a new playlist when the library already contains one", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([playlist]);
    const create = vi
      .spyOn(api, "createPlaylist")
      .mockResolvedValue({ ...playlist, id: "new-playlist", name: "Soirée" });
    renderResults();
    fireEvent.click(
      await screen.findByRole("button", { name: /nouvelle playlist/i }),
    );
    fireEvent.change(screen.getByLabelText(/nom de la nouvelle playlist/i), {
      target: { value: "Soirée" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^créer$/i }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByLabelText(/playlist de destination/i)).toHaveValue(
        "new-playlist",
      ),
    );
  });

  it("saves unique session tracks and updates individual saved buttons", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([playlist]);
    const addTrack = vi.spyOn(api, "addTrack").mockResolvedValue(undefined);
    const props = renderResults([track, track]);
    fireEvent.click(
      await screen.findByRole("button", { name: /tout enregistrer/i }),
    );
    await waitFor(() =>
      expect(addTrack).toHaveBeenCalledExactlyOnceWith(
        playlist.id,
        props.ownerId,
        expect.objectContaining({ deezerId: "42", title: "One More Time" }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: /session enregistrée/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /one more time enregistré/i }),
    ).toBeDisabled();
  });

  it("retries only the unsaved tracks after a partially failed session save", async () => {
    vi.spyOn(api, "playlists").mockResolvedValue([playlist]);
    const add = vi
      .spyOn(api, "addTrack")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Connexion interrompue."))
      .mockResolvedValue(undefined);
    renderResults([track, secondTrack]);
    fireEvent.click(
      await screen.findByRole("button", { name: /tout enregistrer/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /1 titre enregistré.*connexion interrompue/i,
    );
    expect(
      screen.getByRole("button", { name: /one more time enregistré/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /tout enregistrer/i }));
    expect(
      await screen.findByRole("button", { name: /session enregistrée/i }),
    ).toBeDisabled();
    expect(add.mock.calls.map((call) => call[2].deezerId)).toEqual([
      "42",
      "43",
      "43",
    ]);
  });

  it("retains the results and offers a retry when the library fails", async () => {
    vi.spyOn(api, "playlists")
      .mockRejectedValueOnce(
        new Error("Bibliothèque temporairement indisponible."),
      )
      .mockResolvedValueOnce([playlist]);
    renderResults();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /bibliothèque temporairement/i,
    );
    expect(screen.getByText("One More Time")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    expect(
      await screen.findByRole("button", { name: /tout enregistrer/i }),
    ).toBeEnabled();
  });

  it("keeps film answers out of musical playlists", async () => {
    const list = vi.spyOn(api, "playlists");
    renderResults([
      {
        ...track,
        trackId: "movie-12",
        questionType: "movie",
        trackTitle: undefined,
        mediaTitle: "Interstellar",
        audioUrl: "",
      },
    ]);
    expect(screen.getByText("Interstellar")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /tout enregistrer/i }),
    ).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });
});
