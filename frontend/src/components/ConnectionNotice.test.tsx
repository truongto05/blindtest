import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectionNotice from "./ConnectionNotice";

describe("connection notice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("avoids flashing on fast connections and explains a slow startup", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ConnectionNotice state="reconnecting" onRetry={retry} />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tu peux déjà préparer",
    );
    act(() => vi.advanceTimersByTime(10_500));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Il peut être en train de démarrer",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Relancer la connexion" }),
    );
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ConnectionNotice state="connected" onRetry={retry} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("explains offline state immediately without an unusable retry button", () => {
    render(<ConnectionNotice state="offline" onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tu es hors connexion",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cleans up delayed messages when leaving the page", () => {
    const { unmount } = render(
      <ConnectionNotice state="reconnecting" onRetry={vi.fn()} />,
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
