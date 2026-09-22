import { expect, test } from "@playwright/test";
test("two players join and a refreshed guest reconnects", async ({
  browser,
}, testInfo) => {
  const device = {
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  };
  const hostContext = await browser.newContext(device);
  const guestContext = await browser.newContext(device);
  const host = await hostContext.newPage();
  await host.goto("/");
  await host.getByLabel(/ton pseudo/i).fill("Nina");
  await host.getByRole("button", { name: /créer un salon/i }).click();
  await host.getByRole("button", { name: /créer le salon/i }).click();
  const codeButton = host.locator('button[aria-label^="Copier le code"]');
  await expect(codeButton).toBeVisible();
  const code = (await codeButton.getAttribute("aria-label"))!.split(" ").pop()!;
  const guest = await guestContext.newPage();
  await guest.goto(`/?room=${code}`);
  await expect(
    guest.getByRole("heading", { name: /rejoins la partie/i }),
  ).toBeVisible();
  await expect(
    guest.getByRole("button", { name: /créer un salon/i }),
  ).toHaveCount(0);
  await guest.getByLabel(/ton pseudo/i).fill("Sam");
  await expect(guest.getByLabel(/code du salon/i)).toHaveValue(code);
  await guest.getByRole("button", { name: /rejoindre/i }).click();
  await expect(host.getByText("Sam", { exact: true })).toBeVisible();
  expect(
    await guest.evaluate(() => localStorage.getItem("pulse_active_room")),
  ).toBe(code);
  expect(
    await guest.evaluate(() => localStorage.getItem("pulse_username")),
  ).toBe("Sam");
  await guest.reload();
  await expect(guest.getByText("Nina", { exact: true })).toBeVisible();
  await expect(guest.getByText(/^Sam/)).toBeVisible();
  await guest.getByRole("button", { name: /je suis prêt/i }).click();
  await expect(
    host.getByRole("button", { name: /lancer la partie/i }),
  ).toBeEnabled();
  await host
    .getByRole("button", { name: /modifier tous les réglages/i })
    .click();
  await host.getByRole("button", { name: /expert/i }).click();
  await host.getByRole("button", { name: /enregistrer les réglages/i }).click();
  await expect(host).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(host.getByText("Saisie libre", { exact: true })).toBeVisible();
  await expect(
    host.getByRole("button", { name: /lancer la partie/i }),
  ).toBeDisabled();
  await expect(
    guest.getByRole("button", { name: /je suis prêt/i }),
  ).toBeVisible();
  await guestContext.setOffline(true);
  await expect(
    guest.getByRole("button", { name: /je suis prêt/i }),
  ).toBeDisabled();
  await guest.getByRole("button", { name: "Quitter", exact: true }).click();
  await expect(guest).toHaveURL("/");
  await guestContext.setOffline(false);
  await expect(guest.getByText(/Tu es hors connexion/i)).toHaveCount(0);
  await host
    .getByRole("button", { name: /modifier tous les réglages/i })
    .click();
  await host.getByRole("button", { name: /express/i }).click();
  await host.getByRole("button", { name: /enregistrer les réglages/i }).click();
  await expect(host).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(guest).toHaveURL("/");
  await expect(
    guest.getByRole("heading", { name: /reconnais le son/i }),
  ).toBeVisible();
  await hostContext.close();
  await guestContext.close();
});
