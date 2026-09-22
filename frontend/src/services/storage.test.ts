import { afterEach, describe, expect, it, vi } from "vitest";
import { storage } from "./storage";
afterEach(() => vi.restoreAllMocks());
describe("session storage", () => {
  it("does not restore a session removed by another tab", () => {
    storage.set("external-logout", "token");
    localStorage.removeItem("external-logout");
    expect(storage.get("external-logout")).toBeNull();
  });
  it("keeps a memory-only session when writes are denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    storage.set("denied-write", "session-value");
    expect(storage.get("denied-write")).toBe("session-value");
    storage.remove("denied-write");
    expect(storage.get("denied-write")).toBeNull();
  });
  it("supports private browsing with blocked storage reads and writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    storage.set("private-session", "value");
    expect(storage.get("private-session")).toBe("value");
    storage.remove("private-session");
    expect(storage.get("private-session")).toBeNull();
  });
  it("reads an update from another tab rather than its stale memory value", () => {
    storage.set("new-session", "old");
    localStorage.setItem("new-session", "new");
    expect(storage.get("new-session")).toBe("new");
    storage.remove("new-session");
  });
});
