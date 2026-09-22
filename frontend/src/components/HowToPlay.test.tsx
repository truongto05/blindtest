import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HowToPlay from "./HowToPlay";

describe("HowToPlay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function openRules() {
    const trigger = screen.getByRole("button", { name: "Comment jouer" });
    trigger.focus();
    fireEvent.click(trigger);
    act(() => vi.advanceTimersByTime(20));
    return {
      trigger,
      dialog: screen.getByRole("dialog", { name: "Comment jouer" }),
    };
  }

  it("opens real rules without submitting a surrounding form", () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <HowToPlay className="test-help" />
      </form>,
    );
    const trigger = screen.getByRole("button", { name: "Comment jouer" });
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveClass("test-help");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const { dialog } = openRules();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.closest("form")).toBeNull();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
    expect(dialog).toHaveTextContent("Une seule réponse par manche");
    expect(dialog).toHaveTextContent("de 500 à 1 000 points");
    expect(dialog).toHaveTextContent("moins la bonne réponse rapporte");
    expect(dialog).toHaveTextContent("son code, son lien ou son QR code");
    expect(dialog).toHaveTextContent("Réessayer");
    expect(submit).not.toHaveBeenCalled();
  });

  it("traps keyboard focus and restores focus and scrolling on Escape", () => {
    document.body.style.overflow = "auto";
    render(<HowToPlay />);
    const { trigger, dialog } = openRules();
    const close = within(dialog).getByRole("button", {
      name: "Fermer les règles du jeu",
    });
    const understood = within(dialog).getByRole("button", { name: "Compris" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(understood).toHaveFocus();
    fireEvent.keyDown(understood, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("closes from either explicit control or the backdrop, but not inside", () => {
    render(<HowToPlay />);
    const { trigger, dialog } = openRules();
    fireEvent.mouseDown(
      within(dialog).getByRole("heading", { name: "Comment jouer" }),
    );
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Compris" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    const reopened = openRules().dialog;
    fireEvent.mouseDown(reopened.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    openRules();
    fireEvent.click(
      screen.getByRole("button", { name: "Fermer les règles du jeu" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("cleans up the focus frame and scroll lock when unmounted while open", () => {
    const { unmount } = render(<HowToPlay />);
    fireEvent.click(screen.getByRole("button", { name: "Comment jouer" }));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
