import { describe, expect, it, vi, afterEach } from "vitest";
import i18n from "../../i18n";
import {
  elapsed,
  formatDate,
  formatDateHeading,
  formatHours,
  formatTime,
  minutesToDecimal,
  totalHours,
} from "../formatting";

afterEach(() => {
  vi.useRealTimers();
});

describe("durations", () => {
  it("formats whole and fractional hours", () => {
    expect(formatHours(0)).toBe("0h");
    expect(formatHours(30)).toBe("0.5h");
    expect(formatHours(60)).toBe("1h");
    expect(formatHours(90)).toBe("1.5h");
    expect(formatHours(600)).toBe("10h");
    expect(formatHours(6000)).toBe("100h");
    // Two decimals kept when they carry information.
    expect(formatHours(603)).toBe("10.05h");
  });

  it("shows an em dash for no value", () => {
    expect(formatHours(null)).toBe("—");
    expect(minutesToDecimal(null)).toBe("");
  });

  it("sums entries", () => {
    expect(totalHours([])).toBe("0");
    expect(
      totalHours([
        { duration_minutes: 90 },
        { duration_minutes: 30 },
        { duration_minutes: null },
        {},
      ]),
    ).toBe("2");
  });
});

describe("elapsed", () => {
  it("counts from the start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(elapsed("2026-06-15T11:58:57Z")).toBe("00:01:03");
    expect(elapsed("2026-06-15T09:00:00Z")).toBe("03:00:00");
    // Past 24 hours the hour field keeps counting rather
    // than wrapping, which is what a forgotten timer looks
    // like the next morning.
    expect(elapsed("2026-06-14T10:00:00Z")).toBe("26:00:00");
  });

  it("clamps a start in the future to zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    expect(elapsed("2026-06-15T13:00:00Z")).toBe("00:00:00");
  });
});

describe("dates", () => {
  it("falls back to the raw value when unparseable", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatTime(null)).toBe("—");
  });

  it("formats a heading in the selected language", async () => {
    // formatDateLabel already does this; the heading in the
    // clock widget sat on a hardcoded en-US, so a German UI
    // showed "Heute" one day and "Apr 12" the next.
    await i18n.changeLanguage("en");
    const en = formatDateHeading("2026-04-12");
    expect(en).toBe("Apr 12");

    // German puts the day first and abbreviates with a
    // period; Spanish uses its own month name. Asserting
    // "not the English string" rather than the exact output
    // keeps this from breaking on an ICU data update.
    await i18n.changeLanguage("de");
    expect(formatDateHeading("2026-04-12")).not.toBe(en);

    await i18n.changeLanguage("es");
    expect(formatDateHeading("2026-04-12")).not.toBe(en);

    await i18n.changeLanguage("en");
  });
});
