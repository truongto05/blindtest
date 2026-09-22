import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSelectionInfo } from "../catalog/officialSelections";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("./http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http")>()),
  fetchJson: fetch,
}));

const rawTrack = (id = 3135556) => ({
  id,
  title: "  One More Time  ",
  artist: { id: 27, name: "  Daft Punk  " },
  preview: "https://cdnt-preview.dzcdn.net/stream/example.mp3",
  album: {
    cover_medium: "https://cdn-images.dzcdn.net/images/cover/example.jpg",
  },
  readable: true,
  rank: 876543,
  isrc: "gbduw0000064",
  release_date: "2001-03-12",
});
let loadMusicCatalog: typeof import("./musicCatalogService").loadMusicCatalog;

describe("bounded music catalogue loading", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    fetch.mockReset().mockResolvedValue({ data: [rawTrack()] });
    ({ loadMusicCatalog } = await import("./musicCatalogService"));
  });
  afterEach(() => vi.useRealTimers());

  it("returns canonical metadata and merges provenance without inventing difficulty", async () => {
    const result = await loadMusicCatalog("pop");
    expect(result).toEqual([
      {
        id: "3135556",
        title: "One More Time",
        artist: "Daft Punk",
        artistId: "27",
        preview: rawTrack().preview,
        cover: rawTrack().album.cover_medium,
        popularity: 876543,
        isrc: "GBDUW0000064",
        year: 2001,
        genres: ["pop"],
        sourceIds: ["1083902971", "1036183001"],
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips unplayable or untrusted audio and sanitizes artwork and metadata", async () => {
    const invalidPreviews = [
      "http://dzcdn.net/a.mp3",
      "https://dzcdn.net.evil.test/a.mp3",
      "https://user:pass@dzcdn.net/a.mp3",
      "https://dzcdn.net:444/a.mp3",
      "javascript:alert(1)",
    ];
    fetch.mockResolvedValue({
      data: [
        ...invalidPreviews.map((preview, index) => ({
          ...rawTrack(index + 1),
          preview,
        })),
        { ...rawTrack(11), readable: false },
        { ...rawTrack(12), title: " " },
        { ...rawTrack(13), id: -1 },
        { ...rawTrack(14), artist: { name: "" } },
        { ...rawTrack(15), preview: "" },
        {
          ...rawTrack(16),
          title: "a".repeat(250),
          rank: -1,
          isrc: "invalid",
          release_date: "2999-01-01",
          album: { cover_medium: "https://evil.test/cover.jpg" },
        },
      ],
    });
    const [track] = await loadMusicCatalog("custom", "123");
    expect(track.id).toBe("16");
    expect(track.title).toHaveLength(200);
    expect(track.cover).toBe("");
    expect(track).not.toHaveProperty("popularity");
    expect(track).not.toHaveProperty("isrc");
    expect(track).not.toHaveProperty("year");
    expect(track.genres).toEqual([]);
  });

  it("paginates using constructed URLs and never follows an upstream next URL", async () => {
    fetch.mockResolvedValueOnce({
      data: [rawTrack(1)],
      next: "https://evil.test/private",
    });
    fetch.mockResolvedValueOnce({ data: [rawTrack(2)] });
    expect(
      await loadMusicCatalog(
        "custom",
        "https://www.deezer.com/fr/playlist/123?utm_source=test",
      ),
    ).toHaveLength(2);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.deezer.com/playlist/123/tracks?index=0&limit=100",
      "https://api.deezer.com/playlist/123/tracks?index=100&limit=100",
    ]);
  });

  it("caps pagination at three pages and deduplicates repeated IDs", async () => {
    fetch.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("index"));
      return {
        data: Array.from({ length: 100 }, (_, index) =>
          rawTrack(offset + index + 1),
        ),
        next: "ignored",
        total: 10000,
      };
    });
    expect(await loadMusicCatalog("custom", "123")).toHaveLength(300);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("coalesces concurrent loads and never shares mutable cached metadata", async () => {
    let resolve!: (value: unknown) => void;
    fetch.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = loadMusicCatalog("custom", "123");
    const second = loadMusicCatalog("custom", "123");
    resolve({ data: [rawTrack()] });
    const [a, b] = await Promise.all([first, second]);
    a[0].title = "tampered";
    a[0].sourceIds!.push("evil");
    expect(b[0].title).toBe("One More Time");
    expect((await loadMusicCatalog("custom", "123"))[0].sourceIds).toEqual([
      "123",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires successful sources after five minutes", async () => {
    await loadMusicCatalog("custom", "123");
    vi.advanceTimersByTime(300001);
    await loadMusicCatalog("custom", "123");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds the successful source cache to 64 entries", async () => {
    for (let id = 1; id <= 65; id++)
      await loadMusicCatalog("custom", String(id));
    await loadMusicCatalog("custom", "1");
    expect(fetch).toHaveBeenCalledTimes(66);
    await loadMusicCatalog("custom", "65");
    expect(fetch).toHaveBeenCalledTimes(66);
  });

  it("does not cache errors and never exposes upstream diagnostics", async () => {
    fetch.mockRejectedValueOnce(new Error("private diagnostic"));
    await expect(loadMusicCatalog("custom", "123")).rejects.toThrow(
      "pas assez de sources",
    );
    expect(await loadMusicCatalog("custom", "123")).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("continues a mix only when at least three distinct source families remain", async () => {
    const ids = getSelectionInfo("all_mix")!
      .sources.slice(0, 3)
      .map(({ id }) => id);
    fetch.mockImplementation(async (url: string) => {
      const id = url.split("/")[4];
      if (!ids.includes(id)) throw new Error("unavailable");
      return { data: [rawTrack(Number(id))] };
    });
    const tracks = await loadMusicCatalog("all_mix");
    expect(tracks).toHaveLength(3);
    expect(new Set(tracks.flatMap(({ genres }) => genres))).toEqual(
      new Set(["pop", "rap", "rock"]),
    );
  });

  it("refuses a mix with only two families instead of substituting Hits", async () => {
    const ids = getSelectionInfo("all_mix")!
      .sources.slice(0, 2)
      .map(({ id }) => id);
    fetch.mockImplementation(async (url: string) => ({
      data: ids.includes(url.split("/")[4]) ? [rawTrack()] : [],
    }));
    await expect(loadMusicCatalog("all_mix")).rejects.toThrow(
      "varier les styles",
    );
    expect(fetch.mock.calls.some(([url]) => url.includes("3155776842"))).toBe(
      false,
    );
  });

  it("requires at least two sources for Hits", async () => {
    fetch.mockImplementation(async (url: string) => ({
      data: url.includes("3155776842") ? [rawTrack()] : [],
    }));
    await expect(loadMusicCatalog("all")).rejects.toThrow(
      "pas assez de sources",
    );
  });

  it("rejects unknown selections and malformed custom URLs before networking", async () => {
    await expect(loadMusicCatalog("not-a-genre")).rejects.toThrow(
      "n’existe pas",
    );
    for (const value of [
      "0",
      "001",
      "https://evil.test/playlist/123",
      "https://deezer.com.evil.test/playlist/123",
      "https://user:pass@deezer.com/playlist/123",
      "https://deezer.com/playlist/123/track/456",
      "../123",
    ]) {
      await expect(loadMusicCatalog("custom", value)).rejects.toThrow(
        "identifiant numérique",
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects Deezer error envelopes and malformed responses as unavailable sources", async () => {
    for (const response of [
      null,
      [],
      { error: { code: 800, message: "private" } },
      { data: "invalid" },
      { data: [] },
    ]) {
      fetch.mockResolvedValue(response);
      await expect(loadMusicCatalog("custom", "123")).rejects.toThrow(
        "pas assez de sources",
      );
    }
  });
});
