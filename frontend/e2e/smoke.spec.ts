import { captureDocumentation } from "./screenshots";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("home is responsive, accessible and can configure a room", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /reconnais le son/i }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await page.getByRole("button", { name: /créer un salon/i }).click();
  await expect(
    page.getByRole("heading", { name: /compose ta partie/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /progressif/i })
    .last()
    .click();
  await page.getByLabel(/nombre de manches/i).fill("7");
  await page.getByRole("button", { name: /créer le salon/i }).click();
  await expect(page.getByText(/code du salon/i)).toBeVisible();
  await expect(page.getByText("Progressif", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("shared room links prefill the join code", async ({ page }, testInfo) => {
  await page.goto("/?room=ABC123");
  await expect(page.getByLabel(/code du salon/i)).toHaveValue("ABC123");
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await expect(page.getByRole("button", { name: /^rejoindre/i })).toBeEnabled();
  if (testInfo.project.name === "mobile") {
    await page.evaluate(() => document.fonts.ready);
    await captureDocumentation(page, "invitation-mobile.png");
  }
});
