import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { audioFixture } from "./audio-fixture";

async function expectNoSeriousAxeIssue(page: Page) {
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(
      (issue) => issue.impact === "serious" || issue.impact === "critical",
    ),
  ).toEqual([]);
}

test("home selections carry real music and film settings into customization", async ({
  page,
}) => {
  await page.goto("/");
  const rap = page.getByRole("button", { name: "Choisir Rap français" });
  await rap.click();
  await expect(rap).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Choisir Tous les hits" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Personnaliser la partie" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel("Sélection musicale")).toHaveValue("rap");
  await expect(
    page.getByRole("button", { name: "Musique", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Progressif", exact: true }).click();
  await page.getByRole("button", { name: "Retour", exact: true }).click();

  await page.getByRole("button", { name: "Choisir Films" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("pulse_settings") || "{}").gameType,
      ),
    )
    .toBe("movie");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Choisir Films" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Personnaliser la partie" }).click();
  await expect(page.getByLabel("Catégorie")).toHaveValue("movie");
  await expect(
    page.getByRole("button", { name: "Cinéma & TV", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Classique", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Progressif", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Sélection musicale")).toHaveCount(0);
});

test("game rules stay accessible, scrollable and keyboard usable at 320 px and 200 percent text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const trigger = page.getByRole("button", { name: "Comment jouer" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Comment jouer" });
  const close = dialog.getByRole("button", {
    name: "Fermer les règles du jeu",
  });
  const understood = dialog.getByRole("button", { name: "Compris" });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  expect(
    await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight + 1 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth + 1 &&
        node.scrollWidth <= node.clientWidth + 1 &&
        node.scrollHeight > node.clientHeight
      );
    }),
  ).toBe(true);
  await expectNoSeriousAxeIssue(page);

  await page.keyboard.press("Shift+Tab");
  await expect(understood).toBeFocused();
  await expect(understood).toBeInViewport();
  expect(await dialog.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

  await trigger.click();
  await understood.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the mobile friends shortcut focuses the real nickname field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Jouer entre amis" }).click();
  const nickname = page.getByLabel("Ton pseudo");
  await expect(nickname).toBeFocused();
  await expect(nickname).toBeInViewport();
  await nickname.fill("Nina");
  await expect(
    page.getByRole("button", { name: "Créer un salon" }),
  ).toBeEnabled();
  await expect(page).toHaveURL(/\/$/);
});

test("a home selection launches a real two-round solo game directly to the results", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      "pulse_settings",
      JSON.stringify({ rounds: 2, timeLimit: 20, answerType: "title" }),
    );
  });
  await audioFixture(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Choisir Tous les hits" }).click();
  const play = page.getByRole("button", { name: "Jouer en solo", exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(
    page.getByRole("heading", { name: "Monte le son." }),
  ).toBeVisible();
  const nextQuestion = () =>
    page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/quiz/next",
    );
  let incoming = nextQuestion();
  await page
    .getByRole("button", { name: "Activer le son et commencer" })
    .click();
  const trackIds: number[] = [];
  const titles: string[] = [];
  for (let round = 1; round <= 2; round += 1) {
    const response = await incoming;
    expect(response.ok()).toBeTruthy();
    const query = new URL(response.url()).searchParams;
    expect(query.get("genre")).toBe("all");
    expect(query.get("rounds")).toBe("2");
    expect(query.get("type")).toBe("title");
    const question = (await response.json()) as {
      trackId: number;
      correctAnswer: string;
      choices: string[];
    };
    expect(question.choices).toHaveLength(4);
    expect(new Set(question.choices).size).toBe(4);
    trackIds.push(question.trackId);
    titles.push(question.correctAnswer);
    const answer = page.getByRole("button", {
      name: question.correctAnswer,
      exact: true,
    });
    await expect(answer).toBeEnabled();
    if (round < 2) incoming = nextQuestion();
    await answer.click();
    await expect(
      page.getByRole("heading", { name: "Bien joué !" }),
    ).toBeVisible();
  }
  expect(new Set(trackIds).size).toBe(2);
  await expect(page.getByRole("heading", { name: "Ton résultat" })).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(page).toHaveURL(/\/results$/);
  await expect(
    page.getByRole("heading", { name: "Titres de la session" }),
  ).toBeVisible();
  for (const title of titles)
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rejouer", exact: true }),
  ).toBeEnabled();
});
