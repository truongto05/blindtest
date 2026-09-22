import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const expectNoSeriousAxeIssue = async (page: Page) => {
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);
};

const expectNoOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.right > document.documentElement.clientWidth + 1
        );
      })
      .map((node) => ({
        tag: node.tagName,
        className: node.className,
        text: node.textContent?.slice(0, 40),
      }))
      .slice(0, 8),
  );
  expect(overflow).toEqual([]);
};

test("enlarged accessibility preferences remain scrollable and keyboard usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expectNoOverflow(page);
  await expectNoSeriousAxeIssue(page);
  const trigger = page.getByRole("button", {
    name: /options d’accessibilité/i,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /options d’accessibilité/i });
  const motion = dialog.getByRole("switch", {
    name: /réduire les animations/i,
  });
  await motion.click();
  await expect(motion).toHaveAttribute("aria-checked", "true");
  expect(
    await dialog
      .locator("section")
      .evaluate(
        (node) =>
          node.clientHeight <= window.innerHeight &&
          node.scrollWidth <= node.clientWidth,
      ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("settings and lobby reflow at 320 px with enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByLabel(/ton pseudo/i).fill("Nina");
  await page.getByRole("button", { name: /créer un salon/i }).click();
  const options = page.locator(".mixer-switch").first().getByRole("button");
  const normalPositions = await options.evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().top),
  );
  expect(normalPositions[0]).toBe(normalPositions[1]);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const enlargedPositions = await options.evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().top),
  );
  expect(enlargedPositions[1]).toBeGreaterThan(enlargedPositions[0]!);
  await expect(
    page.getByRole("heading", { name: /compose ta partie/i }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await expectNoSeriousAxeIssue(page);
  await page.getByRole("button", { name: /créer le salon/i }).click();
  await expect(page.getByText(/code du salon/i)).toBeVisible();
  await expectNoOverflow(page);
  await expectNoSeriousAxeIssue(page);
});

test("accessibility dialog traps focus, closes with Escape and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toHaveCSS("clip-path", "inset(50%)");
  await page.locator("main").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS("clip-path", "none");
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const trigger = page.getByRole("button", {
    name: /options d’accessibilité/i,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /options d’accessibilité/i });
  await expect(dialog).toBeVisible();
  await expectNoSeriousAxeIssue(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
