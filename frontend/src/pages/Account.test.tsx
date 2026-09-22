import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Account from "./Account";
import type { AccountState } from "../features/account/useAccount";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../services/auth", async (original) => ({
  ...(await original<typeof import("../services/auth")>()),
  getAuthClient: () => ({ auth }),
}));
const base: AccountState = {
  profile: null,
  session: null,
  initializing: false,
  loading: false,
  error: "",
  configured: true,
  reload: vi.fn(),
};
const renderAccount = (
  overrides: Partial<AccountState> = {},
  path = "/compte",
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Account
        account={{ ...base, ...overrides }}
        guestOwnerId="LIB-GUEST"
        onSignedOut={vi.fn()}
      />
    </MemoryRouter>,
  );
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("account access and recovery", () => {
  it("offers guest play but no fake login form when Auth is unconfigured", () => {
    renderAccount({ configured: false });
    expect(
      screen.getByRole("link", { name: "Continuer sans compte" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByLabelText("Adresse e-mail")).not.toBeInTheDocument();
  });
  it("shows initialization and session errors without exposing provider internals", () => {
    const view = renderAccount({ initializing: true });
    expect(screen.getByRole("status")).toHaveTextContent("Chargement");
    view.unmount();
    renderAccount({ error: "Impossible de retrouver ta session." });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impossible de retrouver",
    );
  });
  it("submits sign-up to Auth and explains email confirmation", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    renderAccount();
    fireEvent.click(screen.getByRole("button", { name: "Créer un compte" }));
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "nina@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "a-long-fixture-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "M’inscrire" }));
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledOnce());
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "nina@example.test",
        options: { emailRedirectTo: `${location.origin}/compte` },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "confirmer ton inscription",
    );
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
  });
  it("reports a failed login safely and allows retry", async () => {
    auth.signInWithPassword.mockResolvedValue({
      error: {
        code: "invalid_credentials",
        message: "secret provider details",
      },
    });
    renderAccount();
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "nina@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connexion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Adresse e-mail ou mot de passe incorrect.",
    );
    expect(screen.queryByText(/secret provider/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connexion" })).toBeEnabled();
  });
  it("requests password recovery without revealing whether an email exists", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    renderAccount();
    fireEvent.click(
      screen.getByRole("button", { name: "Mot de passe oublié ?" }),
    );
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), {
      target: { value: "nina@example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer le lien de récupération" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Si cette adresse correspond à un compte",
    );
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "nina@example.test",
      { redirectTo: `${location.origin}/compte/reinitialiser` },
    );
  });
  it("requires a recovered session before allowing a password change", () => {
    renderAccount({}, "/compte/reinitialiser");
    expect(
      screen.queryByRole("button", { name: "Enregistrer le mot de passe" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Ouvre le lien reçu par e-mail/)).toBeVisible();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
