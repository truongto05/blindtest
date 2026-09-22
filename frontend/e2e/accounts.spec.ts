import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

// Only the identity provider is simulated. SDK session handling, the internal
// API, PostgreSQL, profile/playlist authorization and Socket.IO remain real.
async function login(page: Page, displayName: string) {
  const id = randomUUID();
  const user = {
    id,
    email: `${id}@pulse.test`,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    is_anonymous: false,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        iss: "pulse-e2e",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "pulse_e2e_signature",
  ].join(".");
  await page.route("https://pulse-auth.test/auth/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (path.endsWith("/user")) return route.fulfill({ json: user });
    if (path.endsWith("/token"))
      return route.fulfill({
        json: {
          access_token: token,
          token_type: "bearer",
          refresh_token: `refresh-${id}`,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        },
      });
    return route.fulfill({
      status: 400,
      json: { error: "Unexpected fixture route" },
    });
  });
  await page.goto("/compte");
  await page.getByLabel("Adresse e-mail").fill(user.email);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "Connexion", exact: true }).click();
  await page.getByLabel("Pseudo public").fill(displayName);
  await page.getByRole("button", { name: "Créer mon profil" }).click();
  await expect(page.getByText("Ton profil est enregistré.")).toBeVisible();
  return { id, token };
}

test("accounts keep private libraries separate, persist a session and import guests without duplicates", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const guestOwner = `LIB-${randomUUID()}`;
  const seeded = await request.post("/api/playlists", {
    data: { ownerId: guestOwner, name: "Souvenirs invités" },
  });
  expect(seeded.ok()).toBeTruthy();
  await page.addInitScript((owner) => {
    if (!localStorage.getItem("pulse_library_id"))
      localStorage.setItem("pulse_library_id", owner);
  }, guestOwner);
  const { token } = await login(page, "Nina");
  await page
    .getByRole("button", {
      name: "Copier ma bibliothèque invitée dans mon compte",
    })
    .click();
  await page.getByRole("button", { name: "Confirmer la copie" }).click();
  await expect(
    page.getByText("1 playlist(s) copiée(s) dans ton compte."),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Copier ma bibliothèque invitée dans mon compte",
    })
    .click();
  await page.getByRole("button", { name: "Confirmer la copie" }).click();
  await expect(
    page.getByText("Cette bibliothèque a déjà été importée."),
  ).toBeVisible();
  const own = await request.get("/api/account/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(own.ok()).toBeTruthy();
  const { libraryOwnerId } = await own.json();
  expect(
    (
      await request.get("/api/playlists", {
        headers: { "X-Library-Id": libraryOwnerId },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.get("/api/playlists", {
        headers: { "X-Library-Id": guestOwner },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("link", { name: "Ouvrir ma bibliothèque" }).click();
  await expect(
    page.getByRole("heading", { name: "Souvenirs invités" }),
  ).toBeVisible();
  await page.getByLabel("Créer une playlist").fill("Seulement mon compte");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Seulement mon compte" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Seulement mon compte" }),
  ).toBeVisible();
  const secondTab = await page.context().newPage();
  await secondTab.goto("/playlists");
  await expect(
    secondTab.getByRole("heading", { name: "Seulement mon compte" }),
  ).toBeVisible();
  await page.goto("/compte");
  await page
    .getByRole("button", { name: "Me déconnecter de cet appareil" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    secondTab.getByRole("heading", { name: "Seulement mon compte" }),
  ).toHaveCount(0);
  await secondTab.reload();
  await expect(
    secondTab.getByRole("heading", { name: "Souvenirs invités" }),
  ).toBeVisible();
  await expect(
    secondTab.getByRole("heading", { name: "Seulement mon compte" }),
  ).toHaveCount(0);
  await secondTab.close();
  await page.goto("/playlists");
  await expect(
    page.getByRole("heading", { name: "Souvenirs invités" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Seulement mon compte" }),
  ).toHaveCount(0);
});

test("two accounts become friends and join a real room by an explicit invitation", async ({
  page,
  browser,
}, testInfo) => {
  // Two real account/profile flows plus friendship, room and axe audit.
  test.setTimeout(90_000);
  const otherContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4175",
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  });
  const other = await otherContext.newPage();
  try {
    await login(page, "Nina");
    await login(other, "Léa");
    await other.getByRole("link", { name: "Mes amis" }).click();
    const code = await other
      .getByRole("textbox", { name: "Ton code ami" })
      .inputValue();
    await page.getByRole("link", { name: "Mes amis" }).click();
    await page.getByLabel("Son code ami").fill(code);
    await page.getByRole("button", { name: "Envoyer une demande" }).click();
    await expect(
      page.getByRole("button", { name: "Annuler la demande à Léa" }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: "Actualiser", exact: true })
      .click();
    await other
      .getByRole("button", { name: "Accepter la demande de Nina" })
      .click();
    await expect(
      other.getByRole("button", { name: "Retirer Nina de mes amis" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Accueil", exact: true }).click();
    await page.getByRole("button", { name: "Créer un salon" }).click();
    await page.getByRole("button", { name: "Créer le salon" }).click();
    await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/);
    const roomCode = page.url().split("/").at(-1)!;
    await page.getByRole("button", { name: "Inviter mes amis" }).click();
    await page
      .getByRole("button", { name: `Inviter Léa dans ${roomCode}` })
      .click();
    // A click starts the request; the recipient must refresh after it commits.
    await expect(page.getByRole("status")).toHaveText(
      "Invitation envoyée à Léa.",
    );
    await other
      .getByRole("button", { name: "Actualiser", exact: true })
      .click();
    const invitation = other.getByRole("link", {
      name: `Rejoindre le salon ${roomCode} de Nina`,
    });
    await expect(invitation).toBeVisible();
    expect(new URL(other.url()).pathname).toBe("/amis");
    const audit = await new AxeBuilder({ page: other }).analyze();
    expect(
      audit.violations.filter(
        (issue) => issue.impact === "serious" || issue.impact === "critical",
      ),
    ).toEqual([]);
    await invitation.click();
    await other.getByRole("button", { name: "Rejoindre", exact: true }).click();
    await expect(other).toHaveURL(new RegExp(`/rooms/${roomCode}$`));
    await expect(
      other.getByRole("list", { name: "Joueurs dans le salon" }),
    ).toContainText("Nina");
    await expect(
      other.getByRole("list", { name: "Joueurs dans le salon" }),
    ).toContainText("Léa");
  } finally {
    await otherContext.close().catch(() => {});
  }
});
