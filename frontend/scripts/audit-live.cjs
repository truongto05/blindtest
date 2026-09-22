// Read-only deployment smoke check. No playlist or room is created.
// Raw bodies, browser errors, private headers and query values are never logged.
const DEFAULT_SITE = "https://blindtest-tt.vercel.app";
const DEFAULT_API = "https://blindtest-s3ow.onrender.com";
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readOrigin(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("INVALID_AUDIT_ORIGIN");
  return url.origin;
}

function matchesContract(path, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (path === "/api/health") return body.status === "ok";
  if (path === "/api/ready")
    return body.status === "ready" && body.database === "ok";
  return (
    Array.isArray(body.items) &&
    Number.isInteger(body.total) &&
    Number.isInteger(body.page) &&
    Number.isInteger(body.pageSize)
  );
}

async function probeApi(api, site, path, fetcher = fetch) {
  const startedAt = Date.now();
  try {
    const response = await fetcher(`${api}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Origin: site },
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
    });
    const body = await response.json().catch(() => undefined);
    const contractMatches = matchesContract(path, body);
    const corsMatches =
      response.headers.get("access-control-allow-origin") === site;
    return {
      check: path.split("?")[0],
      status: response.status,
      contractMatches,
      corsMatches,
      elapsedMs: Date.now() - startedAt,
      passed: response.status === 200 && contractMatches && corsMatches,
    };
  } catch {
    return {
      check: path.split("?")[0],
      status: null,
      passed: false,
      reason: "NETWORK_OR_TIMEOUT",
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function probePages(site) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const results = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: "block",
    });
    let blockedWrites = 0;
    let pageErrors = 0;
    // This audit checks page availability, never the gameplay protocol.
    // Interception without connectToServer prevents any application WebSocket event.
    await context.routeWebSocket("**/*", (route) => route.close());
    await context.route("**/*", (route) => {
      if (READ_METHODS.has(route.request().method())) return route.continue();
      blockedWrites += 1;
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    page.on("pageerror", () => {
      pageErrors += 1;
    });
    for (const route of [
      { path: "/", heading: undefined },
      { path: "/playlists/public", heading: /playlists publiques/i },
      { path: "/mentions-legales", heading: /^Mentions légales$/i },
    ]) {
      try {
        const response = await page.goto(`${site}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
        const status = response?.status() ?? null;
        let headingFound = false;
        if (status === 200) {
          const heading = route.heading
            ? page.getByRole("heading", { name: route.heading }).first()
            : page.locator("main h1").first();
          headingFound = await heading
            .waitFor({ state: "visible", timeout: 15_000 })
            .then(
              () => true,
              () => false,
            );
        }
        results.push({
          check: route.path,
          status,
          headingFound,
          passed: status === 200 && headingFound,
        });
      } catch {
        results.push({
          check: route.path,
          passed: false,
          reason: "NAVIGATION_OR_TIMEOUT",
        });
      }
    }
    results.push({
      check: "browser-runtime",
      pageErrors,
      blockedWrites,
      passed: pageErrors === 0,
    });
    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  const site = readOrigin(process.env.PULSE_AUDIT_SITE || DEFAULT_SITE);
  const api = readOrigin(process.env.PULSE_AUDIT_API || DEFAULT_API);
  console.log(JSON.stringify({ audit: "read-only", site, api }));
  const results = await Promise.all(
    ["/api/health", "/api/ready", "/api/playlists/public?limit=1"].map((path) =>
      probeApi(api, site, path),
    ),
  );
  try {
    results.push(...(await probePages(site)));
  } catch {
    results.push({
      check: "browser",
      passed: false,
      reason: "BROWSER_UNAVAILABLE",
    });
  }
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some((result) => !result.passed)) {
    console.error(
      "Audit incomplet ou non conforme : vérifier la version publiée, les routes, CORS et la disponibilité de la base. Aucun résultat local ne valide automatiquement le déploiement.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "Contrôles de disponibilité réussis. Les parties, l’audio et les écritures de playlists restent à vérifier séparément.",
  );
}

module.exports = { matchesContract, probeApi, readOrigin };
if (require.main === module) {
  void main().catch(() => {
    console.error(
      "Audit impossible : vérifier les origines configurées et l’installation locale. Aucun détail sensible affiché.",
    );
    process.exitCode = 1;
  });
}
