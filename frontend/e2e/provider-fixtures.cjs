// Loaded only by the E2E server command, never by the production entrypoint.
// Internal API, validation, Prisma and Socket.IO remain real. Only Deezer's
// fixture tracks and the all-hits source are deterministic, so provider outages
// cannot mask regressions. Other catalogue requests are not intercepted.
if (
  process.env.NODE_ENV !== "test" ||
  !/^pulse_e2e_[a-f0-9]{16}$/.test(process.env.PULSE_E2E_SCHEMA || "")
) {
  throw new Error(
    "Les fixtures nécessitent le serveur et le schéma E2E isolés.",
  );
}
const nock = require("../../backend/node_modules/nock");
const tracks = [
  { id: 910000001, title: "Dernier métro", path: "preview.wav" },
  { id: 910000002, title: "Les lumières du soir", path: "game.wav" },
];
for (const track of tracks) {
  nock("https://api.deezer.com")
    .persist()
    .get(`/track/${track.id}`)
    .reply(200, {
      id: track.id,
      title: track.title,
      artist: { name: "Les Voyageurs" },
      album: { cover_medium: "" },
      preview: `https://cdnt-preview.dzcdn.net/pulse-e2e/${track.path}`,
    });
}

// All sources required by Hits/Mix. The real loader still merges provenance,
// filters tracks, checks coverage, and the real selector builds each game.
const catalogue = [
  ["Dernier métro", "Les Voyageurs"],
  ["Feu de joie", "Luna"],
  ["Sous la pluie", "Orion"],
  ["Océan", "Les Hirondelles"],
  ["Minuit", "Atlas"],
  ["La traversée", "Éclipse"],
  ["Danse avec moi", "Sillage"],
  ["Nouveau départ", "Cosmos"],
  ["Promenade", "Boreal"],
  ["Les jours heureux", "Cascade"],
  ["Météorite", "Tandem"],
  ["Sans détour", "Zéphyr"],
];
for (const source of [
  "3155776842",
  "1036183001",
  "1420459465",
  "1999435002",
  "1306931615",
  "3801761042",
  "867825522",
])
  nock("https://api.deezer.com")
    .persist()
    .get(`/playlist/${source}/tracks`)
    .query({ limit: "100", index: "0" })
    .reply(200, {
      total: catalogue.length,
      data: catalogue.map(([title, artist], number) => ({
        id: 910000100 + number,
        title,
        artist: { id: 920000100 + number, name: artist },
        album: { cover_medium: "" },
        preview: `https://cdnt-preview.dzcdn.net/pulse-e2e/hits-${number}.wav`,
      })),
    });
