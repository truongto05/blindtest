const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { matchesContract, probeApi, readOrigin } = require("./audit-live.cjs");

const site = "https://pulse.example";
const api = "https://api.pulse.example";
const root = path.resolve(__dirname, "..");

test("deployment audit accepts only origins, without credentials or paths", () => {
  assert.equal(readOrigin(`${site}/`), site);
  for (const address of [
    "file:///tmp",
    `${site}/play`,
    `${site}?key=private`,
    "https://user:secret@pulse.example",
    `${site}/#private`,
  ]) {
    assert.throws(() => readOrigin(address), /INVALID_AUDIT_ORIGIN/);
  }
});

test("an old API response or unavailable database cannot pass readiness", () => {
  assert.equal(matchesContract("/api/health", { status: "ok" }), true);
  assert.equal(
    matchesContract("/api/ready", { status: "ready", database: "ok" }),
    true,
  );
  assert.equal(
    matchesContract("/api/ready", {
      status: "unavailable",
      database: "unavailable",
    }),
    false,
  );
  assert.equal(matchesContract("/api/playlists/public?limit=1", []), false);
  assert.equal(
    matchesContract("/api/playlists/public?limit=1", {
      items: [],
      total: 0,
      page: 1,
      pageSize: 1,
    }),
    true,
  );
});

test("API probe performs a read and checks the exact CORS origin", async () => {
  const result = await probeApi(
    api,
    site,
    "/api/ready",
    async (url, options) => {
      assert.equal(url, `${api}/api/ready`);
      assert.equal(options.method, "GET");
      assert.equal(options.body, undefined);
      assert.equal(options.headers.Origin, site);
      return Response.json(
        { status: "ready", database: "ok" },
        { headers: { "Access-Control-Allow-Origin": site } },
      );
    },
  );
  assert.equal(result.passed, true);
  const wildcard = await probeApi(api, site, "/api/ready", async () =>
    Response.json(
      { status: "ready", database: "ok" },
      { headers: { "Access-Control-Allow-Origin": "*" } },
    ),
  );
  assert.equal(wildcard.passed, false);
});

test("API probe never returns response bodies or raw network errors", async () => {
  const privateMarker = "PRIVATE_TEST_MARKER";
  const result = await probeApi(api, site, "/api/ready", async () =>
    Response.json({ error: privateMarker }, { status: 503 }),
  );
  assert.equal(result.passed, false);
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
  const failed = await probeApi(api, site, "/api/ready", async () => {
    throw new Error(privateMarker);
  });
  assert.equal(failed.reason, "NETWORK_OR_TIMEOUT");
  assert.equal(JSON.stringify(failed).includes(privateMarker), false);
});

test("SPA rewrites preserve deep links without swallowing branded assets", () => {
  const config = JSON.parse(
    readFileSync(path.join(root, "vercel.json"), "utf8"),
  );
  const rewrite = new RegExp(`^${config.rewrites[0].source}$`);
  for (const route of [
    "/",
    "/playlists/public",
    "/mentions-legales",
    "/p/public-link",
    "/rooms/ABC123",
  ]) {
    assert.equal(rewrite.test(route), true, route);
  }
  for (const asset of [
    "/assets/main.js",
    "/fonts/unbounded-latin.woff2",
    "/pulse-grain.svg",
    "/sw.js",
    "/registerSW.js",
    "/workbox-123.js",
    "/manifest.webmanifest",
    "/pulse-icon.svg",
    "/pulse-icon-192.png",
    "/pulse-icon-512.png",
    "/pulse-maskable-512.png",
    "/apple-touch-icon.png",
    "/pulse-og.png",
  ]) {
    assert.equal(rewrite.test(asset), false, asset);
  }
});

test("brand assets are real PNGs of the expected size, not placeholder pages", () => {
  for (const [name, width, height] of [
    ["pulse-icon-192.png", 192, 192],
    ["pulse-icon-512.png", 512, 512],
    ["pulse-maskable-512.png", 512, 512],
    ["apple-touch-icon.png", 180, 180],
    ["pulse-og.png", 1200, 630],
  ]) {
    const png = readFileSync(path.join(root, "public", name));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", name);
    assert.equal(png.readUInt32BE(16), width, name);
    assert.equal(png.readUInt32BE(20), height, name);
    assert.ok(png.length < 100 * 1024, name);
  }
});

test("display font is self-hosted and distributed with its license", () => {
  const font = readFileSync(
    path.join(root, "public/fonts/unbounded-latin.woff2"),
  );
  assert.equal(font.subarray(0, 4).toString(), "wOF2");
  assert.ok(font.length < 60 * 1024);
  const license = readFileSync(
    path.join(root, "public/fonts/OFL-Unbounded.txt"),
    "utf8",
  );
  assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
  const index = readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(index, /href="\/fonts\/unbounded-latin.woff2"/);
  assert.doesNotMatch(index, /https?:\/\/fonts\.(?:googleapis|gstatic)\.com/);
});
