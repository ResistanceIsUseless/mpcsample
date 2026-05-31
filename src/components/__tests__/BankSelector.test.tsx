import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMPCStore } from "../../state/store";
import { BankSelector } from "../BankSelector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setState = (s: Record<string, unknown>) => useMPCStore.setState(s as any);

beforeEach(() => {
  setState({ bankIdx: 0, maxBank: 3 });
});

describe("BankSelector", () => {
  it("renders a group with aria-label 'Pad bank'", () => {
    render(<BankSelector />);
    const group = screen.getByRole("group", { name: /pad bank/i });
    expect(group).toBeInTheDocument();
  });

  it("always renders all 8 bank buttons (A–H)", () => {
    render(<BankSelector />);
    const buttons = screen.getAllByRole("button", { name: /Bank [A-H]/i });
    expect(buttons).toHaveLength(8);
  });

  it("still renders 8 bank buttons when maxBank=7", () => {
    act(() => {
      setState({ maxBank: 7 });
    });
    render(<BankSelector />);
    const buttons = screen.getAllByRole("button", { name: /Bank [A-H]/i });
    expect(buttons).toHaveLength(8);
  });

  it("renders 8 buttons regardless of maxBank value", () => {
    act(() => {
      setState({ maxBank: 4 });
    });
    render(<BankSelector />);
    const buttons = screen.getAllByRole("button", { name: /Bank [A-H]/i });
    expect(buttons).toHaveLength(8);
  });

  it("Bank A button has aria-pressed=true when bankIdx=0", () => {
    render(<BankSelector />);
    const bankA = screen.getByRole("button", { name: "Bank A" });
    expect(bankA).toHaveAttribute("aria-pressed", "true");
  });

  it("Bank A button has aria-pressed=false when bankIdx=1", () => {
    act(() => {
      setState({ bankIdx: 1 });
    });
    render(<BankSelector />);
    const bankA = screen.getByRole("button", { name: "Bank A" });
    expect(bankA).toHaveAttribute("aria-pressed", "false");
    const bankB = screen.getByRole("button", { name: "Bank B" });
    expect(bankB).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Bank B calls setBank(1)", () => {
    const setBank = vi.fn();
    setState({ setBank });
    render(<BankSelector />);
    const bankB = screen.getByRole("button", { name: "Bank B" });
    fireEvent.click(bankB);
    expect(setBank).toHaveBeenCalledWith(1);
  });

  it("clicking Bank D calls setBank(3)", () => {
    const setBank = vi.fn();
    setState({ setBank });
    render(<BankSelector />);
    const bankD = screen.getByRole("button", { name: "Bank D" });
    fireEvent.click(bankD);
    expect(setBank).toHaveBeenCalledWith(3);
  });

  it("E–H buttons are always rendered", () => {
    render(<BankSelector />);
    expect(screen.getByRole("button", { name: "Bank E" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank H" })).toBeInTheDocument();
  });

  it("active bank button has 'on' class", () => {
    render(<BankSelector />);
    const bankA = screen.getByRole("button", { name: "Bank A" });
    expect(bankA.className).toContain("on");
    const bankB = screen.getByRole("button", { name: "Bank B" });
    expect(bankB.className).not.toContain("on");
  });
});
