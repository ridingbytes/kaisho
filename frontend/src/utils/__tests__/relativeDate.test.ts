import { describe, expect, it, vi, afterEach } from "vitest";
import { relativeDate } from "../relativeDate";

/** Freeze the clock so the labels are deterministic. */
function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("relativeDate labels", () => {
  it("counts up through the units", () => {
    at("2026-06-15T12:00:00");
    const cases: [string, string][] = [
      ["2026-06-15T11:59:30", "just now"],
      ["2026-06-15T11:59:00", "1 min ago"],
      ["2026-06-15T11:30:00", "30 min ago"],
      ["2026-06-15T11:00:00", "1 hour ago"],
      ["2026-06-15T06:00:00", "6 hours ago"],
      ["2026-06-14T12:00:00", "yesterday"],
      ["2026-06-12T12:00:00", "3 days ago"],
      ["2026-06-05T12:00:00", "1 week ago"],
      ["2026-05-20T12:00:00", "3 weeks ago"],
      ["2026-05-01T12:00:00", "1 month ago"],
      ["2025-06-15T12:00:00", "1 year ago"],
    ];
    for (const [raw, label] of cases) {
      expect(relativeDate(raw).label, raw).toBe(label);
    }
  });

  it("shows the full date for the future", () => {
    at("2026-06-15T12:00:00");
    const r = relativeDate("2026-06-16T12:00:00");
    expect(r.label).toBe(r.full);
    expect(r.label).not.toMatch(/ago/);
  });

  it("returns empty for empty input", () => {
    expect(relativeDate("")).toEqual({
      label: "", full: "",
    });
  });
});

describe("org timestamps", () => {
  it("reads the format kaisho writes", () => {
    at("2026-06-15T12:00:00");
    // format_org_datetime in kaisho/org/clock.py emits an
    // English three-letter weekday on purpose, so the file
    // does not depend on the writer's locale.
    const r = relativeDate("[2026-06-15 Mon 09:00]");
    expect(r.label).toBe("3 hours ago");
  });

  it("reads a two-letter weekday from Emacs", () => {
    at("2026-06-15T12:00:00");
    // Emacs writes the weekday in the running locale, so a
    // German one produces "Mi", "Do", "Sa" -- two letters.
    // The Python parser takes \S+ for exactly this reason
    // (see the comment above _DATETIME_RE); this one has
    // to agree with it or the time is silently dropped and
    // the entry renders as midnight.
    const r = relativeDate("[2026-06-15 Mo 09:00]");
    expect(r.label).toBe("3 hours ago");
  });

  it("reads a longer weekday", () => {
    at("2026-06-15T12:00:00");
    const r = relativeDate("[2026-06-15 Monday 09:00]");
    expect(r.label).toBe("3 hours ago");
  });

  it("falls back to the date when there is no time", () => {
    at("2026-06-15T12:00:00");
    expect(relativeDate("[2026-06-14 Sun]").label)
      .toBe("yesterday");
  });

  it("does not throw on unparseable input", () => {
    at("2026-06-15T12:00:00");
    expect(() => relativeDate("not a date at all"))
      .not.toThrow();
  });
});
