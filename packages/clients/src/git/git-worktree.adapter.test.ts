import { describe, expect, it } from "vitest";

import { parseCommitSha, parseLogStats } from "./git-worktree.adapter.js";

// ---------------------------------------------------------------------------
// parseCommitSha
// ---------------------------------------------------------------------------

describe("parseCommitSha", () => {
  it("extracts a valid 40-char hex SHA", () => {
    const sha = "abc1234567890def1234567890abcdef12345678";
    expect(parseCommitSha(`${sha}\n`)).toBe(sha);
  });

  it("extracts the first SHA when multiple lines are present", () => {
    const first = "abc1234567890def1234567890abcdef12345678";
    const second = "1111111111111111111111111111111111111111";
    expect(parseCommitSha(`${first}\n${second}\n`)).toBe(first);
  });

  it("returns undefined for empty output", () => {
    expect(parseCommitSha("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only output", () => {
    expect(parseCommitSha("   \n  \n")).toBeUndefined();
  });

  it("returns undefined for non-hex strings", () => {
    expect(parseCommitSha("not-a-sha")).toBeUndefined();
  });

  it("returns undefined for short hex strings", () => {
    expect(parseCommitSha("abc123")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    const sha = "abc1234567890def1234567890abcdef12345678";
    expect(parseCommitSha(`  ${sha}  \n`)).toBe(sha);
  });
});

// ---------------------------------------------------------------------------
// parseLogStats
// ---------------------------------------------------------------------------

describe("parseLogStats", () => {
  it("parses numstat lines correctly", () => {
    const output = [
      "10\t5\tsrc/index.ts",
      "20\t3\tsrc/utils.ts",
      "5\t0\tsrc/index.ts",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.linesAdded).toBe(35);
    expect(stats.linesDeleted).toBe(8);
    expect(stats.filesChanged).toBe(2);
  });

  it("returns zero stats for empty output", () => {
    const stats = parseLogStats("");

    expect(stats.linesAdded).toBe(0);
    expect(stats.linesDeleted).toBe(0);
    expect(stats.filesChanged).toBe(0);
    expect(stats.hotspots).toEqual([]);
  });

  it("skips non-numstat lines (commit messages, blank lines)", () => {
    const output = [
      "",
      "commit abc123",
      "Author: Test",
      "",
      "10\t5\tsrc/file.ts",
      "",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.linesAdded).toBe(10);
    expect(stats.linesDeleted).toBe(5);
    expect(stats.filesChanged).toBe(1);
  });

  it("sorts hotspots by change count descending", () => {
    const output = [
      "1\t0\ta.ts",
      "1\t0\tb.ts",
      "1\t0\tb.ts",
      "1\t0\tc.ts",
      "1\t0\tc.ts",
      "1\t0\tc.ts",
    ].join("\n");

    const stats = parseLogStats(output);

    expect(stats.hotspots[0]).toEqual({ file: "c.ts", changeCount: 3 });
    expect(stats.hotspots[1]).toEqual({ file: "b.ts", changeCount: 2 });
    expect(stats.hotspots[2]).toEqual({ file: "a.ts", changeCount: 1 });
  });

  it("respects hotspotLimit", () => {
    const output = [
      "1\t0\ta.ts",
      "1\t0\tb.ts",
      "1\t0\tc.ts",
    ].join("\n");

    const stats = parseLogStats(output, 2);

    expect(stats.hotspots).toHaveLength(2);
  });

  it("handles files with tabs in their path", () => {
    const output = "10\t5\tpath/to\tfile.ts\n";

    const stats = parseLogStats(output);

    expect(stats.filesChanged).toBe(1);
    expect(stats.hotspots[0].file).toBe("path/to\tfile.ts");
  });
});
