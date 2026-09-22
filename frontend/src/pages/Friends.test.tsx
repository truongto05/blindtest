import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Friends from "./Friends";
import type { AccountState } from "../features/account/useAccount";
import { api } from "../services/api";
import { copyText } from "../services/clipboard";
import type {
  FriendsData,
  PublicProfile,
  RoomInvitation,
} from "../types/account";
import { DEFAULT_SETTINGS, type RoomState } from "../types/game";

vi.mock("../services/api", () => ({
  api: {
    friends: vi.fn(),
    invitations: vi.fn(),
    requestFriend: vi.fn(),
    acceptFriend: vi.fn(),
    dismissFriend: vi.fn(),
    removeFriend: vi.fn(),
    inviteFriend: vi.fn(),
    dismissInvitation: vi.fn(),
  },
}));
vi.mock("../services/clipboard", () => ({ copyText: vi.fn() }));

const profile = (id: string, displayName: string): PublicProfile => ({
  id,
  displayName,
  friendCode: "PULSE-A1B2C3D4E5F6",
  createdAt: "2026-09-20T12:00:00Z",
});
const me = { ...profile("me", "Nina"), friendCode: "PULSE-123456789ABC" };
const friend = profile("friend", "Léa");
const incoming = {
  id: "incoming",
  profile: profile("hugo", "Hugo"),
  createdAt: me.createdAt,
};
const outgoing = {
  id: "outgoing",
  profile: profile("ines", "Inès"),
  createdAt: me.createdAt,
};
const emptyFriends: FriendsData = { friends: [], incoming: [], outgoing: [] };
const allFriends: FriendsData = {
  friends: [friend],
  incoming: [incoming],
  outgoing: [outgoing],
};
const account = (ownProfile = me): AccountState => ({
  profile: ownProfile,
  session: {
    access_token: "test",
    refresh_token: "test-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: ownProfile.id,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: ownProfile.createdAt,
    },
  },
  initializing: false,
  loading: false,
  error: "",
  configured: true,
  reload: vi.fn().mockResolvedValue(undefined),
});
const room: RoomState = {
  roomCode: "ABC123",
  phase: "lobby",
  currentRound: 0,
  totalRounds: 10,
  players: [],
  settings: DEFAULT_SETTINGS,
  serverNow: 0,
  deadline: null,
};
const invitation = (): RoomInvitation => ({
  id: "invite",
  profile: friend,
  roomCode: "XYZ789",
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
});

function page(
  currentAccount = account(),
  currentRoom: RoomState | null = null,
  token = "",
) {
  return (
    <MemoryRouter initialEntries={["/amis"]}>
      <Friends
        account={currentAccount}
        currentRoom={currentRoom}
        playerToken={token}
      />
    </MemoryRouter>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Friends", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.friends).mockResolvedValue(emptyFriends);
    vi.mocked(api.invitations).mockResolvedValue({ invitations: [] });
    vi.mocked(api.requestFriend).mockResolvedValue(undefined);
    vi.mocked(api.acceptFriend).mockResolvedValue(undefined);
    vi.mocked(api.dismissFriend).mockResolvedValue(undefined);
    vi.mocked(api.removeFriend).mockResolvedValue(undefined);
    vi.mocked(api.inviteFriend).mockResolvedValue(undefined);
    vi.mocked(api.dismissInvitation).mockResolvedValue(undefined);
    vi.mocked(copyText).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("gates unconfigured, signed-out and incomplete accounts without requesting private data", () => {
    const view = render(page({ ...account(), configured: false }));
    expect(
      screen.getByText("Les comptes ne sont pas encore activés."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voir mon compte" }),
    ).toHaveAttribute("href", "/compte");
    view.rerender(page({ ...account(), session: null, profile: null }));
    expect(
      screen.getByRole("link", { name: "Se connecter ou créer un compte" }),
    ).toHaveAttribute("href", "/compte");
    view.rerender(page({ ...account(), profile: null }));
    expect(
      screen.getByRole("link", { name: "Compléter mon profil" }),
    ).toHaveAttribute("href", "/compte");
    view.rerender(page({ ...account(), loading: true }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Chargement de ton compte",
    );
    expect(api.friends).not.toHaveBeenCalled();
    expect(api.invitations).not.toHaveBeenCalled();
  });

  it("offers a retry for profile errors", () => {
    const broken = { ...account(), error: "Profil indisponible" };
    render(page(broken));
    expect(screen.getByRole("alert")).toHaveTextContent("Profil indisponible");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(broken.reload).toHaveBeenCalledOnce();
    expect(api.friends).not.toHaveBeenCalled();
  });

  it("shows true empty states and a selectable public code", async () => {
    render(page());
    expect(
      await screen.findByText("Aucune invitation en cours."),
    ).toBeInTheDocument();
    expect(screen.getByText("Aucune demande reçue.")).toBeInTheDocument();
    expect(screen.getByText("Aucune demande en attente.")).toBeInTheDocument();
    expect(screen.getByText(/Pas encore d’amis ici/)).toBeInTheDocument();
    const code = screen.getByRole("textbox", { name: "Ton code ami" });
    expect(code).toHaveAttribute("readonly");
    expect(code).toHaveValue(me.friendCode);
    fireEvent.click(screen.getByRole("button", { name: "Copier le code" }));
    expect(copyText).toHaveBeenCalledWith(me.friendCode);
    expect(await screen.findByText("Code ami copié.")).toBeInTheDocument();
  });

  it("selects the friend code for manual copying if clipboard access fails", async () => {
    vi.mocked(copyText).mockRejectedValue(
      new Error(
        "Copie automatique indisponible. Sélectionne le code pour le copier.",
      ),
    );
    render(page());
    await screen.findByText("Aucune invitation en cours.");
    fireEvent.click(screen.getByRole("button", { name: "Copier le code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Copie automatique indisponible",
    );
    const code = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Ton code ami",
    });
    expect(code).toHaveFocus();
    expect(code.selectionStart).toBe(0);
    expect(code.selectionEnd).toBe(me.friendCode.length);
  });

  it("validates and normalizes friend codes and prevents duplicate pending submissions", async () => {
    const request = deferred<void>();
    vi.mocked(api.requestFriend).mockReturnValue(request.promise);
    render(page());
    await screen.findByText("Aucune invitation en cours.");
    const input = screen.getByLabelText("Son code ami");
    const form = screen.getByRole("form", { name: "Ajouter un ami" });
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("PULSE-");
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: me.friendCode } });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("ton propre code");
    expect(api.requestFriend).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: " pulse-a1b2c3d4e5f6 " } });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.requestFriend).toHaveBeenCalledExactlyOnceWith(
      "PULSE-A1B2C3D4E5F6",
    );
    expect(screen.getByRole("button", { name: "Envoi…" })).toBeDisabled();
    await act(async () => {
      request.resolve();
    });
    expect(await screen.findByText("Demande envoyée.")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("keeps a failed action available for retry", async () => {
    vi.mocked(api.requestFriend).mockRejectedValueOnce(
      new Error("Ce code ami est introuvable."),
    );
    render(page());
    await screen.findByText("Aucune invitation en cours.");
    fireEvent.change(screen.getByLabelText("Son code ami"), {
      target: { value: friend.friendCode },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer une demande" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce code ami est introuvable.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer une demande" }),
    );
    expect(await screen.findByText("Demande envoyée.")).toBeInTheDocument();
    expect(api.requestFriend).toHaveBeenCalledTimes(2);
  });

  it("keeps successful invitation data when the friends list fails and can reload", async () => {
    vi.mocked(api.friends).mockRejectedValueOnce(
      new Error("Service indisponible"),
    );
    vi.mocked(api.invitations).mockResolvedValue({
      invitations: [invitation()],
    });
    render(page());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Amis : Service indisponible",
    );
    expect(
      screen.getByRole("link", { name: "Rejoindre le salon XYZ789 de Léa" }),
    ).toHaveAttribute("href", "/?room=XYZ789");
    expect(screen.queryByText(/Pas encore d’amis ici/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Réessayer le chargement" }),
    );
    expect(
      await screen.findByText(/Pas encore d’amis ici/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts received requests and cancels sent requests with their request IDs", async () => {
    vi.mocked(api.friends).mockResolvedValue(allFriends);
    render(page());
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Accepter la demande de Hugo",
      }),
    );
    expect(api.acceptFriend).toHaveBeenCalledExactlyOnceWith("incoming");
    await screen.findByText("Hugo fait maintenant partie de tes amis.");
    fireEvent.click(
      screen.getByRole("button", { name: "Annuler la demande à Inès" }),
    );
    expect(api.dismissFriend).toHaveBeenCalledWith("outgoing");
    await screen.findByText("Demande annulée.");
  });

  it("can refuse a received request without accepting it", async () => {
    vi.mocked(api.friends).mockResolvedValue(allFriends);
    render(page());
    fireEvent.click(
      await screen.findByRole("button", { name: "Refuser la demande de Hugo" }),
    );
    expect(api.dismissFriend).toHaveBeenCalledExactlyOnceWith("incoming");
    expect(api.acceptFriend).not.toHaveBeenCalled();
    await screen.findByText("Demande refusée.");
  });

  it("requires explicit confirmation before removing a friend", async () => {
    vi.mocked(api.friends).mockResolvedValue(allFriends);
    render(page());
    const remove = await screen.findByRole("button", {
      name: "Retirer Léa de mes amis",
    });
    fireEvent.click(remove);
    expect(api.removeFriend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Annuler$/ }));
    expect(remove).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Confirmer le retrait" }),
    ).not.toBeInTheDocument();
    fireEvent.click(remove);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer le retrait" }),
    );
    expect(api.removeFriend).toHaveBeenCalledExactlyOnceWith(friend.id);
    await screen.findByText("Léa ne figure plus dans tes amis.");
  });

  it("only offers an invitation with a waiting room and player token", async () => {
    vi.mocked(api.friends).mockResolvedValue(allFriends);
    const view = render(page());
    await screen.findByText("Léa");
    expect(
      screen.queryByRole("button", { name: /Inviter Léa/ }),
    ).not.toBeInTheDocument();
    view.rerender(page(account(), room, ""));
    expect(
      screen.queryByRole("button", { name: /Inviter Léa/ }),
    ).not.toBeInTheDocument();
    view.rerender(
      page(account(), { ...room, phase: "playing" }, "player-token"),
    );
    expect(
      screen.queryByRole("button", { name: /Inviter Léa/ }),
    ).not.toBeInTheDocument();
    view.rerender(page(account(), room, "player-token"));
    fireEvent.click(
      screen.getByRole("button", { name: "Inviter Léa dans ABC123" }),
    );
    expect(api.inviteFriend).toHaveBeenCalledExactlyOnceWith(
      friend.id,
      "ABC123",
      "player-token",
    );
    await screen.findByText("Invitation envoyée à Léa.");
  });

  it("does not auto-join, hides expired invitations and supports dismissing an invitation", async () => {
    vi.mocked(api.invitations).mockResolvedValue({
      invitations: [
        invitation(),
        {
          ...invitation(),
          id: "expired",
          roomCode: "OLD123",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });
    render(page());
    const join = await screen.findByRole("link", {
      name: "Rejoindre le salon XYZ789 de Léa",
    });
    expect(join).toHaveAttribute("href", "/?room=XYZ789");
    expect(screen.queryByText("OLD123")).not.toBeInTheDocument();
    expect(api.dismissInvitation).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Ignorer l’invitation de Léa" }),
    );
    expect(api.dismissInvitation).toHaveBeenCalledExactlyOnceWith("invite");
    await screen.findByText("Invitation retirée.");
  });

  it("ignores stale reads after switching accounts", async () => {
    const old = deferred<FriendsData>();
    vi.mocked(api.friends)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(emptyFriends);
    const view = render(page());
    view.rerender(
      page(
        account({
          ...profile("second", "Jo"),
          friendCode: "PULSE-FFFFFFFFFFFF",
        }),
      ),
    );
    await screen.findByText(/Pas encore d’amis ici/);
    await act(async () => {
      old.resolve(allFriends);
    });
    expect(screen.queryByText("Hugo")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ton code ami" })).toHaveValue(
      "PULSE-FFFFFFFFFFFF",
    );
    expect(api.friends).toHaveBeenCalledTimes(2);
  });

  it("does not leak completed mutation messages into another account", async () => {
    const request = deferred<void>();
    vi.mocked(api.requestFriend).mockReturnValue(request.promise);
    const view = render(page());
    await screen.findByText("Aucune invitation en cours.");
    fireEvent.change(screen.getByLabelText("Son code ami"), {
      target: { value: friend.friendCode },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer une demande" }),
    );
    view.rerender(page(account(profile("second", "Jo"))));
    await screen.findByText("Aucune invitation en cours.");
    await act(async () => {
      request.resolve();
    });
    expect(screen.queryByText("Demande envoyée.")).not.toBeInTheDocument();
    expect(api.friends).toHaveBeenCalledTimes(2);
  });

  it("polls every 30 seconds only in a visible tab and clears the timer on unmount", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(page());
    });
    expect(api.friends).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.friends).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.friends).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.friends).toHaveBeenCalledTimes(3);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.friends).toHaveBeenCalledTimes(3);
  });

  it("ignores refresh results overtaken by a mutation", async () => {
    const oldRefresh = deferred<FriendsData>();
    vi.mocked(api.friends)
      .mockResolvedValueOnce(allFriends)
      .mockReturnValueOnce(oldRefresh.promise)
      .mockResolvedValue(emptyFriends);
    render(page());
    fireEvent.click(
      await screen.findByRole("button", { name: "Retirer Léa de mes amis" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer le retrait" }),
    );
    await waitFor(() => expect(api.friends).toHaveBeenCalledTimes(3));
    await act(async () => {
      oldRefresh.resolve(allFriends);
    });
    expect(screen.queryByText("Léa")).not.toBeInTheDocument();
    expect(screen.getByText(/Pas encore d’amis ici/)).toBeInTheDocument();
  });
});
