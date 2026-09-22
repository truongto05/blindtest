import { captureDocumentation } from "./screenshots";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { audioFixture } from "./audio-fixture";

async function seed(request: APIRequestContext) {
  const ownerId = `LIB-${randomUUID().toUpperCase()}`;
  const result = await request.post("/api/playlists", {
    data: { ownerId, name: "La sélection du test" },
  });
  expect(result.ok()).toBeTruthy();
  const { id } = (await result.json()) as { id: string };
  expect(
    (
      await request.post(`/api/playlists/${id}/tracks`, {
        data: {
          ownerId,
          deezerId: "910000002",
          title: "Les lumières du soir",
          artist: "Les Voyageurs",
          coverUrl: "",
          previewUrl: "https://cdnt-preview.dzcdn.net/pulse-e2e/game.wav",
        },
      })
    ).ok(),
  ).toBeTruthy();
  return { ownerId, id };
}

async function answer(page: Page) {
  const activate = page.getByRole("button", {
    name: /Activer la lecture|Lire l.extrait|Activer le son/,
  });
  if (await activate.isVisible()) await activate.click();
  const input = page.getByRole("textbox", { name: "Ta réponse" });
  await expect(input).toBeEnabled();
  await input.fill("Les lumières du soir");
  await page.getByRole("button", { name: "Valider la réponse" }).click();
}

test("a personal playlist plays a full solo round and saves the results", async ({
  page,
  context,
  request,
}, testInfo) => {
  const fixture = await seed(request);
  await context.addInitScript(
    (owner) => localStorage.setItem("pulse_library_id", owner),
    fixture.ownerId,
  );
  await audioFixture(context);
  await page.goto(`/playlists/${fixture.id}`);
  await page.getByRole("button", { name: "Jouer avec cette playlist" }).click();
  await expect(page.getByLabel("Playlist de ma bibliothèque")).toHaveValue(
    fixture.id,
  );
  await expect(
    page.getByRole("button", { name: "Lancer la partie" }),
  ).toBeEnabled();
  if (testInfo.project.name === "mobile")
    await captureDocumentation(page, "settings-mobile.png");
  await page.getByRole("button", { name: "Lancer la partie" }).click();
  await page
    .getByRole("button", { name: "Activer le son et commencer" })
    .click();
  await expect(page.getByRole("textbox", { name: "Ta réponse" })).toBeEnabled();
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (issue) => issue.impact === "serious" || issue.impact === "critical",
    ),
  ).toEqual([]);
  await answer(page);
  await expect(
    page.getByRole("heading", { name: "Bien joué !" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Titres de la session" }),
  ).toBeVisible({ timeout: 10_000 });
  if (testInfo.project.name === "mobile")
    await captureDocumentation(page, "results-mobile.png");
  await expect(
    page.getByRole("button", { name: "Session enregistrée" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Nouvelle playlist" }).click();
  await page
    .getByLabel("Nom de la nouvelle playlist")
    .fill("La session gardée");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tout enregistrer" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Tout enregistrer" }).click();
  await expect(
    page.getByRole("button", { name: "Session enregistrée" }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Ma bibliothèque", exact: true })
    .click();
  await page.getByRole("heading", { name: "La session gardée" }).click();
  await expect(
    page.getByText("Les lumières du soir", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Les lumières du soir", { exact: true }),
  ).toBeVisible();
});

test("a host uses a private playlist in a complete multiplayer game", async ({
  browser,
  request,
}, testInfo) => {
  const fixture = await seed(request);
  const device = {
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  };
  const hostContext = await browser.newContext(device);
  const guestContext = await browser.newContext(device);
  await hostContext.addInitScript(
    (owner) => localStorage.setItem("pulse_library_id", owner),
    fixture.ownerId,
  );
  await audioFixture(hostContext);
  await audioFixture(guestContext);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.goto("/");
  await host.getByLabel("Ton pseudo").fill("Nina");
  await host.getByRole("button", { name: "Créer un salon" }).click();
  await host.getByLabel("Sélection musicale").selectOption("pulse");
  await host.getByLabel("Playlist de ma bibliothèque").selectOption(fixture.id);
  await host.getByLabel("Nombre de manches").fill("1");
  await host.getByLabel("Format de réponse").selectOption("input");
  await host.getByLabel("Élément à deviner").selectOption("title");
  await expect(
    host.getByRole("button", { name: "Créer le salon" }),
  ).toBeEnabled();
  await host.getByRole("button", { name: "Créer le salon" }).click();
  const codeButton = host.getByRole("button", { name: /^Copier le code / });
  await expect(codeButton).toBeVisible();
  const code = (await codeButton.getAttribute("aria-label"))!
    .split(" ")
    .at(-1)!;
  if (testInfo.project.name === "mobile")
    await captureDocumentation(host, "lobby-mobile.png");
  await guest.goto(`/?room=${code}`);
  await guest.getByLabel("Ton pseudo").fill("Sam");
  await guest.getByRole("button", { name: "Rejoindre" }).click();
  await guest
    .getByRole("button", { name: "Je suis prêt", exact: true })
    .click();
  await host.getByRole("button", { name: "Lancer la partie" }).click();
  await expect(host.getByRole("textbox", { name: "Ta réponse" })).toBeEnabled();
  if (testInfo.project.name === "mobile")
    await captureDocumentation(host, "game-mobile.png");
  await Promise.all([answer(host), answer(guest)]);
  await expect(
    host.getByRole("button", { name: "Fermer", exact: true }),
  ).toBeFocused();
  await expect(host.locator('a[href="#main-content"]')).toHaveCSS(
    "clip-path",
    "inset(50%)",
  );
  if (testInfo.project.name === "mobile")
    await captureDocumentation(host, "reveal-mobile.png");
  await expect(
    host.getByRole("heading", { name: "Classement final" }),
  ).toBeVisible({ timeout: 12_000 });
  await expect(
    guest.getByRole("heading", { name: "Classement final" }),
  ).toBeVisible();
  await hostContext.close();
  await guestContext.close();
});
