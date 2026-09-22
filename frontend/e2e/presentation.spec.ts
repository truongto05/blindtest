import { captureDocumentation } from "./screenshots";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home, policies and public navigation work at mobile and desktop sizes", async ({
  page,
  request,
}, testInfo) => {
  const readiness = await request.get("/api/ready");
  expect(readiness.ok()).toBeTruthy();
  expect(await readiness.json()).toEqual({ status: "ready", database: "ok" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /reconnais le son/i }),
  ).toBeVisible();
  await expect(page.locator('header img[src="/pulse-icon.svg"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check('800 24px "Unbounded"')),
  ).toBe(true);
  const font = await request.get("/fonts/unbounded-latin.woff2");
  expect(font.ok()).toBeTruthy();
  expect((await font.body()).subarray(0, 4).toString()).toBe("wOF2");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const installedIcons = (await manifest.json()).icons;
  expect(installedIcons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      }),
    ]),
  );
  for (const asset of [
    "/pulse-icon-192.png",
    "/pulse-icon-512.png",
    "/pulse-maskable-512.png",
    "/apple-touch-icon.png",
    "/pulse-og.png",
  ]) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  for (const width of [320, 375, 390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureDocumentation(page, "home.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await captureDocumentation(page, "home-mobile.png");
  }
  await page.getByRole("link", { name: "Mentions légales" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mentions légales" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "truong_toan@hotmail.com" }),
  ).toHaveAttribute("href", "mailto:truong_toan@hotmail.com");
  await expect(page.getByText(/Vercel Inc/)).toBeVisible();
  await expect(
    page.getByText(/Le serveur de jeu et l’API sont hébergés sur Render/),
  ).toBeVisible();
  for (const path of ["/confidentialite", "/cookies", "/conditions"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter(
        (issue) => issue.impact === "serious" || issue.impact === "critical",
      ),
    ).toEqual([]);
  }
  await page.goto("/cette-page-nexiste-pas");
  await expect(
    page.getByRole("heading", { name: "Cette page n’existe pas" }),
  ).toBeVisible();
  await page.goto("/rooms/invalide");
  await expect(
    page.getByRole("heading", { name: "Cette page n’existe pas" }),
  ).toBeVisible();
});
