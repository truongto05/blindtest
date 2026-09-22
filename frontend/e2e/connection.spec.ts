import { captureDocumentation } from "./screenshots";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("branded room loading respects reduced motion", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await page.route(/\/socket\.io\//, (route) => route.abort());
  await page.goto("/rooms/ABC123");
  await expect(
    page.getByRole("heading", { name: "Connexion au salon" }),
  ).toBeVisible();
  const bars = page.locator("main .pulse-loader > span");
  await expect(bars).toHaveCount(3);
  await expect(bars.first()).toHaveCSS("animation-name", "pulse-signal-beat");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(bars.first()).toHaveCSS("animation-name", "none");
  if (testInfo.project.name === "mobile") {
    await page.evaluate(() => document.fonts.ready);
    await captureDocumentation(page, "loading-mobile.png");
  }
  await page.getByRole("link", { name: "Retour à l’accueil" }).click();
  await expect(page).toHaveURL("/");
});

test("slow connection preserves settings and never creates a room without a fresh click", async ({
  page,
}) => {
  let blocked = true;
  await page.route(/\/socket\.io\//, (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await page.goto("/");
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await page.getByRole("button", { name: /créer un salon/i }).click();
  await page.getByLabel(/nombre de manches/i).fill("7");
  const create = page.getByRole("button", { name: /créer le salon/i });
  await expect(create).toBeDisabled();
  await expect(
    page.getByText(/Il peut être en train de démarrer/i),
  ).toBeVisible({ timeout: 20_000 });
  blocked = false;
  await page.getByRole("button", { name: "Relancer la connexion" }).click();
  await expect(create).toBeEnabled({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/rooms\/new$/);
  await expect(page.getByLabel(/nombre de manches/i)).toHaveValue("7");
  await create.click();
  await expect(
    page.locator('button[aria-label^="Copier le code"]'),
  ).toBeVisible();
  await expect(page.getByText("7 × 20 s", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quitter", exact: true }).click();
});

test("an invitation remains accessible offline and can be left without losing the nickname", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/?room=ABC123&source=invitation");
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await expect(page.getByRole("button", { name: /^rejoindre/i })).toBeEnabled();
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: /^rejoindre/i }),
  ).toBeDisabled();
  await expect(page.getByText(/Tu es hors connexion/i)).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(
      (issue) => issue.impact === "serious" || issue.impact === "critical",
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: /choisir une autre partie/i }).click();
  await expect(page).toHaveURL(/\?source=invitation$/);
  await expect(page.getByLabel(/ton pseudo/i)).toHaveValue("Nina");
  await expect(page.getByLabel(/ton pseudo/i)).toBeFocused();
  await expect(
    page.getByRole("button", { name: /personnaliser la partie/i }),
  ).toBeEnabled();
  await context.setOffline(false);
});
