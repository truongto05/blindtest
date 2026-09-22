import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../services/api";
import { DEFAULT_SETTINGS, type Playlist, type Settings } from "../types/game";
import SettingsPage from "./Settings";

const ownerId = "LIB-TEST-12345678";
const playlist: Playlist = {
  id: "4ccad33b-0e8c-4599-89da-248cba1cec75",
  name: "Mes découvertes",
  visibility: "PRIVATE",
  shareId: null,
  createdAt: "2026-09-09T12:00:00Z",
  updatedAt: "2026-09-09T12:00:00Z",
  tracks: [],
  trackCount: 5,
  playableTrackCount: 3,
};
const save = vi.fn();
function Harness({
  initial = DEFAULT_SETTINGS,
  isMultiplayer = false,
  multiplayerConnected = true,
}: {
  initial?: Settings;
  isMultiplayer?: boolean;
  multiplayerConnected?: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  return (
    <MemoryRouter>
      <SettingsPage
        settings={settings}
        setSettings={setSettings}
        ownerId={ownerId}
        onSave={save}
        onBack={vi.fn()}
        isMultiplayer={isMultiplayer}
        multiplayerConnected={multiplayerConnected}
      />
    </MemoryRouter>
  );
}

describe("Settings playlist source", () => {
  beforeEach(() => {
    save.mockClear();
    vi.spyOn(api, "playlists").mockResolvedValue([playlist]);
    vi.spyOn(api, "quizSource").mockImplementation(
      async (_id, _owner, settings) => ({
        name: playlist.name,
        trackCount: 5,
        playableCount: 3,
        issues:
          settings.rounds > 3
            ? [
                "Seulement 3 titres avec extrait : choisis au maximum 3 manches.",
              ]
            : settings.answerMode === "choices"
              ? ["Le QCM demande 4 réponses différentes."]
              : [],
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps local configuration usable while a multiplayer connection is unavailable", async () => {
    const { rerender } = render(
      <Harness isMultiplayer multiplayerConnected={false} />,
    );
    expect(
      screen.getByRole("button", { name: /créer le salon/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/connexion au serveur doit être rétablie/i),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText(/nombre de manches/i), {
      target: { value: "4" },
    });
    expect(screen.getByLabelText(/nombre de manches/i)).toHaveValue(4);
    rerender(<Harness isMultiplayer multiplayerConnected />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /créer le salon/i }),
      ).toBeEnabled(),
    );
    expect(screen.getByLabelText(/nombre de manches/i)).toHaveValue(4);
  });

  it("does not gate solo settings on the multiplayer connection", async () => {
    render(<Harness multiplayerConnected={false} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /lancer la partie/i }),
      ).toBeEnabled(),
    );
  });

  it("blocks an unsuitable private playlist then enables a valid round count and answer mode", async () => {
    render(
      <Harness
        initial={{
          ...DEFAULT_SETTINGS,
          genre: "pulse",
          pulsePlaylistId: playlist.id,
        }}
      />,
    );
    expect(
      await screen.findByText(/seulement 3 titres avec extrait/i),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /lancer la partie/i }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nombre de manches/i), {
      target: { value: "3" },
    });
    expect(await screen.findByText(/le qcm demande 4 réponses/i)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/format de réponse/i), {
      target: { value: "input" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /lancer la partie/i }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /lancer la partie/i }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(api.quizSource).toHaveBeenLastCalledWith(
      playlist.id,
      ownerId,
      expect.objectContaining({ rounds: 3, answerMode: "input" }),
    );
  });

  it("explains a deleted source, blocks launch and offers a retry", async () => {
    vi.mocked(api.quizSource).mockRejectedValue(
      new Error("Cette playlist est introuvable."),
    );
    render(
      <Harness
        initial={{
          ...DEFAULT_SETTINGS,
          genre: "pulse",
          pulsePlaylistId: playlist.id,
        }}
      />,
    );
    expect(
      await screen.findByText("Cette playlist est introuvable."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /lancer la partie/i }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: /revérifier la playlist/i }),
    );
    await waitFor(() => expect(api.quizSource).toHaveBeenCalledTimes(2));
  });

  it("keeps the empty library understandable and Deezer available", async () => {
    vi.mocked(api.playlists).mockResolvedValue([]);
    render(<Harness initial={{ ...DEFAULT_SETTINGS, genre: "pulse" }} />);
    expect(
      await screen.findByRole("link", { name: /ouvrir la bibliothèque/i }),
    ).toHaveAttribute("href", "/playlists");
    expect(
      screen.getByRole("button", { name: /lancer la partie/i }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/sélection musicale/i), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Playlist Deezer"), {
      target: { value: "https://www.deezer.com/fr/playlist/3155776842" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /lancer la partie/i }),
      ).toBeEnabled(),
    );
    expect(api.quizSource).not.toHaveBeenCalled();
  });

  it("lets a number be cleared while editing and rejects decimals", async () => {
    render(<Harness />);
    const rounds = screen.getByLabelText(/nombre de manches/i);
    fireEvent.change(rounds, { target: { value: "" } });
    expect(rounds).toHaveValue(null);
    expect(
      screen.getByRole("button", { name: /lancer la partie/i }),
    ).toBeDisabled();
    fireEvent.change(rounds, { target: { value: "2.5" } });
    expect(rounds).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(rounds, { target: { value: "12" } });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /lancer la partie/i }),
      ).toBeEnabled(),
    );
    expect(rounds).toHaveValue(12);
  });
});
