import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { applyHomeSelection } from "../domain/selections";
import { DEFAULT_SETTINGS } from "../types/game";

type HomeProps = ComponentProps<typeof Home>;

function Harness({
  initialName,
  ...props
}: Omit<HomeProps, "username" | "setUsername"> & { initialName: string }) {
  const [username, setUsername] = useState(initialName);
  const [settings, setSettings] = useState(props.settings);
  return (
    <Home
      {...props}
      settings={settings}
      onSelect={(id) => {
        props.onSelect(id);
        setSettings((previous) => applyHomeSelection(previous, id));
      }}
      username={username}
      setUsername={setUsername}
    />
  );
}

function LocationProbe({ navigation }: { navigation: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="location">
        {location.pathname}
        {location.search}
      </span>
      {navigation && (
        <>
          <button onClick={() => navigate("/?room=xyz789")}>
            Charger une autre invitation
          </button>
          <button onClick={() => navigate(-1)}>Retour navigateur</button>
        </>
      )}
    </>
  );
}

function renderHome({
  initialName = "Nina",
  entry = "/",
  pending = false,
  canJoin = true,
  navigation = false,
} = {}) {
  const actions = {
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onSolo: vi.fn(),
    onPlaylists: vi.fn(),
    onSelect: vi.fn(),
    onQuickPlay: vi.fn(),
  };
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness
        settings={DEFAULT_SETTINGS}
        initialName={initialName}
        pending={pending}
        canJoin={canJoin}
        {...actions}
      />
      <LocationProbe navigation={navigation} />
    </MemoryRouter>,
  );
  return actions;
}

describe("Home", () => {
  afterEach(cleanup);

  it("validates a six-character room code before joining", () => {
    const { onJoin } = renderHome();
    const button = screen.getByRole("button", { name: /^rejoindre$/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/code du salon/i), {
      target: { value: "ab!c123" },
    });
    fireEvent.click(button);
    expect(onJoin).toHaveBeenCalledWith("ABC123", "Nina");
  });

  it("explains the nickname requirement while keeping solo available", () => {
    const { onQuickPlay } = renderHome({ initialName: "" });
    expect(
      screen.getByRole("button", { name: /créer un salon/i }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/ton pseudo/i)).toHaveAccessibleDescription(
      /2 à 24 caractères/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /jouer en solo/i }));
    expect(onQuickPlay).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Reconnais le son.",
    );
  });

  it("marks an unsupported nickname as invalid", () => {
    renderHome({ initialName: "Nina<>" });
    expect(screen.getByLabelText(/ton pseudo/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /créer un salon/i }),
    ).toBeDisabled();
  });

  it("prioritizes the invitation form and joins with its prefilled code", () => {
    const { onJoin, onCreate, onSolo } = renderHome({
      initialName: "",
      entry: "/?room=abc123",
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Rejoins la partie.",
    );
    expect(screen.getByLabelText(/code du salon/i)).toHaveValue("ABC123");
    expect(screen.getByLabelText(/code du salon/i)).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("button", { name: /créer un salon/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /jouer en solo/i }),
    ).not.toBeInTheDocument();
    const join = screen.getByRole("button", { name: /^rejoindre$/i });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/ton pseudo/i), {
      target: { value: "Léa" },
    });
    fireEvent.submit(join.closest("form")!);
    expect(onJoin).toHaveBeenCalledExactlyOnceWith("ABC123", "Léa");
    expect(onCreate).not.toHaveBeenCalled();
    expect(onSolo).not.toHaveBeenCalled();
  });

  it("reacts to another invitation and browser back without remounting Home", () => {
    const { onJoin } = renderHome({ entry: "/?room=ABC123", navigation: true });
    fireEvent.click(
      screen.getByRole("button", { name: /charger une autre invitation/i }),
    );
    expect(screen.getByLabelText(/code du salon/i)).toHaveValue("XYZ789");
    fireEvent.click(screen.getByRole("button", { name: /^rejoindre$/i }));
    expect(onJoin).toHaveBeenCalledWith("XYZ789", "Nina");
    fireEvent.click(screen.getByRole("button", { name: /retour navigateur/i }));
    expect(screen.getByLabelText(/code du salon/i)).toHaveValue("ABC123");
  });

  it("leaves the invitation without discarding unrelated URL parameters or the nickname", () => {
    renderHome({ entry: "/?room=ABC123&source=friend" });
    fireEvent.change(screen.getByLabelText(/ton pseudo/i), {
      target: { value: "Sam" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /choisir une autre partie/i }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/?source=friend");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Reconnais le son.",
    );
    expect(screen.getByLabelText(/code du salon/i)).toHaveValue("");
    expect(screen.getByLabelText(/ton pseudo/i)).toHaveValue("Sam");
    expect(screen.getByLabelText(/ton pseudo/i)).toHaveFocus();
    expect(
      screen.getByRole("button", { name: /créer un salon/i }),
    ).toBeEnabled();
  });

  it("does not turn a malformed room parameter into an invitation", () => {
    renderHome({ entry: "/?room=%3Cbad%3E" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Reconnais le son.",
    );
    expect(screen.getByLabelText(/code du salon/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /^rejoindre$/i })).toBeDisabled();
  });

  it("blocks conflicting navigation and duplicate submissions while joining", () => {
    const { onJoin } = renderHome({ entry: "/?room=ABC123", pending: true });
    const join = screen.getByRole("button", { name: /^rejoindre$/i });
    expect(join).toBeDisabled();
    expect(screen.getByLabelText(/ton pseudo/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /bibliothèque/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /choisir une autre partie/i }),
    ).toBeDisabled();
    expect(join.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Connexion au salon…");
    fireEvent.submit(join.closest("form")!);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("keeps local setup available offline and blocks only joining", () => {
    const { onJoin, onCreate, onSolo } = renderHome({ canJoin: false });
    fireEvent.change(screen.getByLabelText(/code du salon/i), {
      target: { value: "ABC123" },
    });
    expect(screen.getByLabelText(/ton pseudo/i)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /créer un salon/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /jouer en solo/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /personnaliser la partie/i }),
    ).toBeEnabled();
    const join = screen.getByRole("button", { name: /^rejoindre$/i });
    expect(join).toBeDisabled();
    expect(
      screen.getByText(
        "La connexion au serveur doit être rétablie pour entrer.",
      ),
    ).toBeVisible();
    fireEvent.submit(join.closest("form")!);
    expect(onJoin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /créer un salon/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /personnaliser la partie/i }),
    );
    expect(onCreate).toHaveBeenCalledWith("Nina");
    expect(onSolo).toHaveBeenCalledOnce();
  });

  it("lets an invited visitor enter a nickname and leave while the connection is unavailable", () => {
    renderHome({ entry: "/?room=ABC123", canJoin: false });
    expect(screen.getByLabelText(/ton pseudo/i)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /choisir une autre partie/i }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: /^rejoindre$/i })).toBeDisabled();
    expect(
      screen.getByText(
        "La connexion au serveur doit être rétablie pour entrer.",
      ),
    ).toBeVisible();
  });

  it("selects a real universe before quick play without requiring a nickname", () => {
    const { onSelect, onQuickPlay, onSolo } = renderHome({ initialName: "" });
    const films = screen.getByRole("button", { name: "Choisir Films" });
    fireEvent.click(films);
    expect(onSelect).toHaveBeenCalledWith("films");
    expect(films).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Choisir Tous les hits" }),
    ).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /jouer en solo/i }));
    expect(onQuickPlay).toHaveBeenCalledOnce();
    expect(onSolo).not.toHaveBeenCalled();
  });

  it("leaves advanced settings one click away and disables selections while joining", () => {
    const { onSolo } = renderHome();
    fireEvent.click(
      screen.getByRole("button", { name: /personnaliser la partie/i }),
    );
    expect(onSolo).toHaveBeenCalledOnce();
    cleanup();
    renderHome({ pending: true });
    expect(screen.getByRole("button", { name: "Choisir Rock" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /jouer en solo/i }),
    ).toBeDisabled();
  });
});
