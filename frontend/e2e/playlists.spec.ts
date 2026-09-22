import { captureDocumentation } from "./screenshots";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function addTrack(
  request: APIRequestContext,
  id: string,
  ownerId: string,
) {
  const response = await request.post(`/api/playlists/${id}/tracks`, {
    data: {
      ownerId,
      deezerId: "910000001",
      title: "Dernier métro",
      artist: "Les Voyageurs",
      coverUrl: "",
      previewUrl: "https://cdnt-preview.dzcdn.net/pulse-e2e/preview.wav",
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function expectAccessible(page: Page) {
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(
      (issue) => issue.impact === "serious" || issue.impact === "critical",
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

test("private → shared → public → copied → revoked, including direct URLs and refresh", async ({
  page,
  browser,
  request,
}, testInfo) => {
  await page.goto("/playlists");
  await page
    .getByLabel("Créer une playlist")
    .fill("Les découvertes du vendredi");
  await page.getByRole("button", { name: /^Créer$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Les découvertes du vendredi" }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  const ownerId = await page.evaluate(() =>
    localStorage.getItem("pulse_library_id"),
  );
  expect(ownerId).toBeTruthy();
  await addTrack(request, id, ownerId!);
  await page.reload();
  await expect(page.getByText("Dernier métro", { exact: true })).toBeVisible();
  await expect(page.getByText("Privée", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Partager$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Partager la playlist" });
  await dialog.getByRole("radio", { name: /Partagée par lien/ }).check();
  await dialog
    .getByRole("button", { name: "Enregistrer la visibilité" })
    .click();
  const shareLink = await dialog.getByLabel("Lien de la playlist").inputValue();
  expect(shareLink).not.toContain(ownerId!);
  expect(shareLink).not.toContain(id);
  const shareId = shareLink.split("/").at(-1)!;
  const publicResponse = await request.get(`/api/playlists/share/${shareId}`);
  expect(publicResponse.ok()).toBeTruthy();
  expect(await publicResponse.json()).not.toHaveProperty("ownerId");
  expect(await publicResponse.json()).not.toHaveProperty("id");
  const unlistedCatalog = await (
    await request.get("/api/playlists/public")
  ).json();
  expect(
    unlistedCatalog.items.some(
      (item: { shareId: string }) => item.shareId === shareId,
    ),
  ).toBe(false);
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Partager$/ })).toBeFocused();

  const visitorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(shareLink);
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "Les découvertes du vendredi" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: /Supprimer|Renommer|Retirer/ }),
  ).toHaveCount(0);
  await expectAccessible(visitor);
  for (const width of [320, 768, 1440, 1920]) {
    await visitor.setViewportSize({ width, height: 900 });
    expect(
      await visitor.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await visitor
    .getByRole("button", { name: "Ajouter à ma bibliothèque" })
    .click();
  await expect(visitor.getByText("Privée", { exact: true })).toBeVisible();
  const copyId = new URL(visitor.url()).pathname.split("/").at(-1)!;
  expect(copyId).not.toBe(id);
  await visitor.getByRole("button", { name: "Renommer la playlist" }).click();
  await visitor.getByLabel("Nom de la playlist").fill("Ma copie indépendante");
  await visitor.getByRole("button", { name: /^Enregistrer$/ }).click();
  await expect(
    visitor.getByRole("heading", { name: "Ma copie indépendante" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Partager$/ }).click();
  await dialog.getByRole("radio", { name: /^Publique/ }).check();
  await dialog
    .getByRole("button", { name: "Enregistrer la visibilité" })
    .click();
  await expect(dialog.getByLabel("Lien de la playlist")).toHaveValue(shareLink);
  await page.keyboard.press("Escape");
  await visitor.goto("/playlists/public");
  await expect(
    visitor.getByRole("heading", { name: "Les découvertes du vendredi" }),
  ).toBeVisible();
  await expectAccessible(visitor);
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("heading", { name: "Les découvertes du vendredi" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /Visibilité|enregistrée/ }),
    ).toHaveCount(0, { timeout: 8_000 });
    await captureDocumentation(page, "playlist.png");
  }
  await page.getByRole("button", { name: /^Partager$/ }).click();
  await dialog.getByRole("radio", { name: /^Privée/ }).check();
  await dialog
    .getByRole("button", { name: "Enregistrer la visibilité" })
    .click();
  await expect(dialog.getByLabel("Lien de la playlist")).toHaveCount(0);
  expect((await request.get(`/api/playlists/share/${shareId}`)).status()).toBe(
    404,
  );
  await visitor.goto(shareLink);
  await expect(
    visitor.getByRole("heading", { name: "Playlist indisponible" }),
  ).toBeVisible();
  await visitor.goto(`/playlists/${copyId}`);
  await expect(
    visitor.getByRole("heading", { name: "Ma copie indépendante" }),
  ).toBeVisible();
  await visitorContext.close();
});

test("loading and network failures remain readable and recoverable", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/playlists/public?**", async (route) => {
    await gate;
    await route.abort();
  });
  await page.goto("/playlists/public");
  await expect(page.getByText("Chargement des playlists…")).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Impossible de joindre le serveur",
  );
  await page.unroute("**/api/playlists/public?**");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto("/p/invalide");
  await expect(
    page.getByRole("heading", { name: "Playlist indisponible" }),
  ).toBeVisible();
  await expectAccessible(page);
});
