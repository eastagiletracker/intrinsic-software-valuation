import { describe, expect, it } from "vitest";

import { parseDuration } from "./adapter.js";

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("parses a decimal number", () => {
    expect(parseDuration("2.5")).toBe(2.5);
  });

  it("parses an integer", () => {
    expect(parseDuration("3")).toBe(3);
  });

  it("parses HH:MM format", () => {
    expect(parseDuration("02:30")).toBe(2.5);
  });

  it("parses HH:MM with zero minutes", () => {
    expect(parseDuration("01:00")).toBe(1);
  });

  it("parses HH:MM with 15-minute increments", () => {
    expect(parseDuration("00:15")).toBeCloseTo(0.25);
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseDuration("  1.5  ")).toBe(1.5);
  });

  it("returns NaN for non-numeric input", () => {
    expect(parseDuration("abc")).toBeNaN();
  });

  it("returns NaN for empty string", () => {
    expect(parseDuration("")).toBeNaN();
  });

  it("parses very small decimals", () => {
    expect(parseDuration("0.05")).toBe(0.05);
  });
});
