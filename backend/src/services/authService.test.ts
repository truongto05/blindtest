import type { Request } from "express";
import type { RequestInit } from "node-fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessTokenFromRequest,
  AuthError,
  requireAccount,
  verifyAccessToken,
} from "./authService";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("node-fetch", () => ({ default: fetch }));

const account = {
  id: "72a6b974-1b65-4d97-8ea7-88c45347d42b",
  email: "private@example.test",
  email_confirmed_at: "2026-09-14T10:30:00.123456+00:00",
  is_anonymous: false,
  user_metadata: { private: "Not returned to the caller" },
};
const request = (header?: string) =>
  ({ get: vi.fn(() => header) }) as unknown as Request;
const response = (data: unknown = account, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: vi.fn().mockResolvedValue(data),
});

describe("Supabase account verification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SUPABASE_URL", "https://pulse.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("SUPABASE_ANON_KEY", "legacy-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-never-be-used");
    fetch.mockReset().mockResolvedValue(response());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("recognizes one Bearer credential and permits an absent optional header", () => {
    expect(accessTokenFromRequest(request())).toBeUndefined();
    expect(accessTokenFromRequest(request("Bearer signed.jwt.token"))).toBe(
      "signed.jwt.token",
    );
    expect(accessTokenFromRequest(request("bearer signed.jwt.token"))).toBe(
      "signed.jwt.token",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "Bearer",
    "Bearer ",
    "Basic dXNlcjpwYXNz",
    "Bearer  token",
    " Bearer token",
    "Bearer token ",
    "Bearer token\t",
    "Bearer token\n",
    "Bearer token\r\n",
    "Bearer token\nInjected: header",
    "Bearer first, Bearer second",
    "Bearer to=ken",
    "Bearer jeton-é",
    `Bearer ${"a".repeat(8_192)}`,
  ])("rejects malformed or oversized Authorization: %j", (header) => {
    expect(() => accessTokenFromRequest(request(header))).toThrow(AuthError);
    try {
      accessTokenFromRequest(request(header));
    } catch (error) {
      expect(error).toMatchObject({ status: 401 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a token for protected endpoints", async () => {
    await expect(requireAccount(request())).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("verifies with Auth using only the public key and returns only the account id", async () => {
    await expect(
      requireAccount(request("Bearer signed.jwt.token")),
    ).resolves.toEqual({
      id: account.id,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://pulse.supabase.co/auth/v1/user",
      {
        method: "GET",
        headers: {
          apikey: "sb_publishable_test",
          Authorization: "Bearer signed.jwt.token",
        },
        signal: expect.any(AbortSignal),
        redirect: "error",
        size: 262_144,
      },
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("canonicalizes the verified UUID for friendship-pair and owner comparisons", async () => {
    fetch.mockResolvedValue(
      response({ ...account, id: account.id.toUpperCase() }),
    );
    await expect(verifyAccessToken("signed.jwt.token")).resolves.toEqual({
      id: account.id,
    });
  });

  it("uses the legacy anon key only when the publishable key is absent", async () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    await verifyAccessToken("token");
    expect(fetch.mock.calls[0][1].headers.apikey).toBe("legacy-anon-key");
  });

  it.each(["SUPABASE_URL", "both-public-keys"])(
    "reports missing configuration without trying the service-role key: %s",
    async (missing) => {
      if (missing === "SUPABASE_URL") vi.stubEnv("SUPABASE_URL", "");
      else {
        vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
        vi.stubEnv("SUPABASE_ANON_KEY", "");
      }
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("configurés"),
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "not-an-url",
    "http://pulse.supabase.co",
    "ftp://pulse.supabase.co",
    "https://user:password@pulse.supabase.co",
    "https://pulse.supabase.co/auth/v1",
    "https://pulse.supabase.co?key=secret",
    "https://pulse.supabase.co#fragment",
    "http://localhost.attacker.example",
  ])("refuses an unsafe or non-root Supabase URL: %s", async (url) => {
    vi.stubEnv("SUPABASE_URL", url);
    await expect(verifyAccessToken("token")).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:54321",
    "http://127.0.0.1:54321",
    "http://[::1]:54321",
  ])("permits local HTTP only outside production: %s", async (url) => {
    vi.stubEnv("SUPABASE_URL", url);
    await expect(verifyAccessToken("token")).resolves.toEqual({
      id: account.id,
    });
    expect(fetch.mock.calls[0][0]).toBe(`${url}/auth/v1/user`);
    fetch.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    await expect(verifyAccessToken("token")).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["sb_secret_wrong-key", "public-key\nInjected: header"])(
    "rejects a secret or malformed public key without sending it: %j",
    async (key) => {
      vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", key);
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 503,
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "",
    "token with spaces",
    "token\n",
    "token\r\n",
    "token\nheader",
    "a".repeat(8_193),
  ])(
    "validates tokens even when called without the request helper",
    async (token) => {
      await expect(verifyAccessToken(token)).rejects.toMatchObject({
        status: 401,
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 403])(
    "rejects invalid credentials returned by Auth (%i)",
    async (status) => {
      const upstream = response(
        { diagnostic: "private upstream detail" },
        status,
      );
      fetch.mockResolvedValue(upstream);
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 401,
        message: expect.not.stringContaining("private"),
      });
      expect(upstream.json).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([null, undefined, "", "invalid-date", "2026-09-14"])(
    "requires an ISO email confirmation timestamp, not merely confirmed_at: %j",
    async (emailConfirmedAt) => {
      fetch.mockResolvedValue(
        response({
          ...account,
          email_confirmed_at: emailConfirmedAt,
          confirmed_at: "2026-09-14T10:30:00Z",
        }),
      );
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 403,
      });
    },
  );

  it.each([true, undefined, "false"])(
    "requires an explicitly non-anonymous account: %j",
    async (anonymous) => {
      fetch.mockResolvedValue(
        response({ ...account, is_anonymous: anonymous }),
      );
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 403,
      });
    },
  );

  it.each([
    null,
    {},
    { ...account, id: "not-a-uuid" },
    { ...account, id: undefined },
  ])(
    "refuses invalid identity responses without trusting arbitrary identifiers",
    async (data) => {
      fetch.mockResolvedValue(response(data));
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 503,
      });
    },
  );

  it.each([302, 404, 429, 500, 503])(
    "reports temporary upstream failures (%i)",
    async (status) => {
      fetch.mockResolvedValue(response({}, status));
      await expect(verifyAccessToken("token")).rejects.toMatchObject({
        status: 503,
      });
    },
  );

  it("does not disclose network or JSON parsing diagnostics", async () => {
    fetch.mockRejectedValueOnce(new Error("private network diagnostic"));
    await expect(verifyAccessToken("token")).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("private"),
    });
    fetch.mockResolvedValueOnce({
      ...response(),
      json: vi.fn().mockRejectedValue(new Error("private JSON payload")),
    });
    await expect(verifyAccessToken("token")).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("private"),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled verification after eight seconds and clears the timer", async () => {
    fetch.mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const verification = expect(
      verifyAccessToken("token"),
    ).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await verification;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not cache a previously authorized token", async () => {
    await expect(verifyAccessToken("token")).resolves.toEqual({
      id: account.id,
    });
    fetch.mockResolvedValueOnce(response({}, 401));
    await expect(verifyAccessToken("token")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
