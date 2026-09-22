import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("./http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http")>()),
  fetchJson: fetch,
}));

const response = {
  id: 3135556,
  title: "One More Time",
  artist: { name: "Daft Punk" },
  album: {
    cover_medium:
      "https://cdn-images.dzcdn.net/images/cover/example/250x250.jpg",
  },
  preview: "https://cdns-preview-a.dzcdn.net/stream/example.mp3",
};
let resolveDeezerTrack: typeof import("./deezerTrackService").resolveDeezerTrack;

describe("canonical Deezer tracks", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
    fetch.mockReset().mockResolvedValue(response);
    ({ resolveDeezerTrack } = await import("./deezerTrackService"));
  });
  afterEach(() => vi.useRealTimers());

  it("fetches the fixed Deezer endpoint and returns only canonical metadata", async () => {
    const track = await resolveDeezerTrack("3135556");
    expect(fetch).toHaveBeenCalledWith("https://api.deezer.com/track/3135556");
    expect(track).toEqual({
      deezerId: "3135556",
      title: "One More Time",
      artist: "Daft Punk",
      coverUrl: response.album.cover_medium,
      previewUrl: response.preview,
    });
  });

  it.each([
    "https://attacker.example/track",
    "../3135556",
    "3135556?redirect=evil",
    "movie:123",
    "0",
    "001",
    "99999999999999999",
  ])("rejects an invalid id before any request: %s", async (id) => {
    await expect(resolveDeezerTrack(id)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "http://cdns-preview-a.dzcdn.net/stream/example.mp3",
    "https://dzcdn.net.attacker.example/a.mp3",
    "https://attacker.example/a.mp3",
    "https://someone:password@cdns-preview-a.dzcdn.net/a.mp3",
    "https://cdns-preview-a.dzcdn.net:444/a.mp3",
    "javascript:alert(1)",
  ])(
    "rejects untrusted media URLs from an invalid upstream response: %s",
    async (preview) => {
      fetch.mockResolvedValue({ ...response, preview });
      await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
        status: 503,
      });
    },
  );

  it("also validates artwork and refuses a response for another track", async () => {
    fetch.mockResolvedValueOnce({
      ...response,
      album: { cover_medium: "https://attacker.example/cover.jpg" },
    });
    await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
      status: 503,
    });
    fetch.mockResolvedValueOnce({ ...response, id: 42 });
    await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("keeps tracks without previews and bounds long metadata", async () => {
    fetch.mockResolvedValue({
      ...response,
      title: `  ${"a".repeat(250)}  `,
      artist: { name: "  Daft Punk  " },
      preview: "",
      album: undefined,
    });
    const track = await resolveDeezerTrack("3135556");
    expect(track.title).toHaveLength(200);
    expect(track.artist).toBe("Daft Punk");
    expect(track.previewUrl).toBe("");
    expect(track.coverUrl).toBe("");
  });

  it("distinguishes a missing title from an unavailable catalogue without leaking diagnostics", async () => {
    fetch.mockResolvedValueOnce({ error: { code: 800, message: "no data" } });
    await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
      status: 404,
    });
    fetch.mockRejectedValueOnce(new Error("sensitive upstream diagnostic"));
    await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("sensitive"),
    });
    fetch.mockResolvedValueOnce({ error: { code: 4, message: "quota" } });
    await expect(resolveDeezerTrack("3135556")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("caches successful responses for five minutes without sharing mutable objects", async () => {
    const first = await resolveDeezerTrack("3135556");
    first.title = "Spoofed";
    expect((await resolveDeezerTrack("3135556")).title).toBe("One More Time");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-09-10T12:05:01Z"));
    await resolveDeezerTrack("3135556");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("evicts an old entry once the bounded cache is full", async () => {
    fetch.mockImplementation(async (url: string) => ({
      ...response,
      id: Number(url.split("/").pop()),
    }));
    for (let id = 1; id <= 301; id++) await resolveDeezerTrack(String(id));
    await resolveDeezerTrack("1");
    expect(fetch).toHaveBeenCalledTimes(302);
    await resolveDeezerTrack("301");
    expect(fetch).toHaveBeenCalledTimes(302);
  });
});
