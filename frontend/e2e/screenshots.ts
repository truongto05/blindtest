import type { Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

/** Documentation captures are opt-in: ordinary tests must not dirty the repository. */
export async function captureDocumentation(page: Page, name: string) {
  if (process.env.PULSE_UPDATE_SCREENSHOTS !== "1") return;
  if (!/^[a-z-]+\.png$/.test(name)) throw new Error("Invalid screenshot name");
  await page.screenshot({
    path: fileURLToPath(
      new URL(`../../docs/screenshots/${name}`, import.meta.url),
    ),
    fullPage: true,
    scale: "css",
    animations: "disabled",
  });
}
