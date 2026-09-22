import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "./useAccount";
const mock = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  account: vi.fn(),
}));
vi.mock("../../services/auth", () => ({
  authConfigured: true,
  getAuthClient: () => ({ auth: mock }),
}));
vi.mock("../../services/api", () => ({ api: { account: mock.account } }));
let change: (event: AuthChangeEvent, session: Session | null) => void;
const session = (id: string) =>
  ({ user: { id }, access_token: `${id}-token` }) as Session;
const profile = (id: string) => ({
  profile: {
    id,
    displayName: id,
    friendCode: "PULSE-123456789ABC",
    createdAt: "2026-09-21T00:00:00Z",
  },
  libraryOwnerId: `LIB-${id}`,
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.onAuthStateChange.mockImplementation((callback) => {
    change = callback;
    return { data: { subscription: { unsubscribe: mock.unsubscribe } } };
  });
  mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mock.account.mockResolvedValue(profile("first"));
});
afterEach(cleanup);
describe("account session isolation", () => {
  it("does not restore an old initial session after an auth event", async () => {
    let resolve!: (data: unknown) => void;
    mock.getSession.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(useAccount);
    await act(async () => change("SIGNED_IN", session("first")));
    await act(async () =>
      resolve({ data: { session: session("old") }, error: null }),
    );
    expect(result.current.session?.user.id).toBe("first");
    expect(result.current.profile?.id).toBe("first");
  });
  it("discards a private response after switching accounts", async () => {
    let resolve!: (data: unknown) => void;
    mock.account
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(profile("second"));
    const { result } = renderHook(useAccount);
    await act(async () => change("SIGNED_IN", session("first")));
    await act(async () => change("SIGNED_IN", session("second")));
    await act(async () => resolve(profile("first")));
    expect(result.current.profile?.id).toBe("second");
    expect(result.current.libraryOwnerId).toBe("LIB-second");
  });
  it("keeps an in-flight profile request valid across a same-user token refresh", async () => {
    let resolve!: (data: unknown) => void;
    mock.account.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(useAccount);
    await act(async () => change("SIGNED_IN", session("first")));
    await act(async () => change("TOKEN_REFRESHED", session("first")));
    await act(async () => resolve(profile("first")));
    expect(result.current.profile?.id).toBe("first");
    expect(result.current.loading).toBe(false);
  });
  it("clears private profile state on logout and unsubscribes", async () => {
    const { result, unmount } = renderHook(useAccount);
    await act(async () => change("SIGNED_IN", session("first")));
    await waitFor(() => expect(result.current.profile?.id).toBe("first"));
    await act(async () => change("SIGNED_OUT", null));
    expect(result.current.profile).toBeNull();
    expect(result.current.libraryOwnerId).toBeUndefined();
    unmount();
    expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
});
