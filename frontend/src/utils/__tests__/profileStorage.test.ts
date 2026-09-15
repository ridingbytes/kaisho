import {
  afterEach, beforeEach, describe, expect, it, vi,
} from "vitest";

/** Let every queued microtask and one macrotask run.
 *  Three Promise.resolve() ticks are not enough for the
 *  fetch -> json -> setActiveProfile chain. */
const settle = () =>
  new Promise((r) => setTimeout(r, 0));

/**
 * The module fetches the active profile on import and
 * caches it, so each test needs a fresh module registry
 * with its own fetch stub.
 */
async function loadModule(
  profile: string,
  opts: { resolve?: boolean } = {},
) {
  const { resolve = true } = opts;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });

  vi.stubGlobal("fetch", vi.fn(async () => {
    if (!resolve) await gate;
    return {
      json: async () => ({ active: profile }),
    } as Response;
  }));

  vi.resetModules();
  const mod = await import("../profileStorage");
  if (resolve) await settle();
  return { ...mod, release };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("once the profile is known", () => {
  it("prefixes reads and writes with it", async () => {
    const m = await loadModule("org-mode");
    expect(m.getActiveProfile()).toBe("org-mode");

    m.profileSet("filter", "open");
    expect(localStorage.getItem("org-mode:filter"))
      .toBe("open");
    expect(m.profileGet("filter")).toBe("open");

    m.profileRemove("filter");
    expect(m.profileGet("filter")).toBeNull();
  });

  it("keeps two profiles apart", async () => {
    const a = await loadModule("default");
    a.profileSet("filter", "aus default");

    const b = await loadModule("org-mode");
    expect(b.profileGet("filter")).toBeNull();
    b.profileSet("filter", "aus org-mode");

    expect(localStorage.getItem("default:filter"))
      .toBe("aus default");
    expect(localStorage.getItem("org-mode:filter"))
      .toBe("aus org-mode");
  });

  it("migrates an unprefixed value once", async () => {
    localStorage.setItem("filter", "alt");
    const m = await loadModule("org-mode");
    expect(m.profileGet("filter")).toBe("alt");
    expect(localStorage.getItem("org-mode:filter"))
      .toBe("alt");
    expect(localStorage.getItem("filter")).toBeNull();
  });
});

describe("before the profile is known", () => {
  it("does not write into the wrong profile", async () => {
    // The fetch is in flight. A component that renders
    // now -- task cards read deadline acks during render
    // -- calls straight through.
    const m = await loadModule("org-mode", {
      resolve: false,
    });
    m.profileSet("filter", "gehoert zu org-mode");

    m.release();
    await settle();

    expect(localStorage.getItem("default:filter"))
      .toBeNull();
    expect(localStorage.getItem("org-mode:filter"))
      .toBe("gehoert zu org-mode");
  });

  it("does not migrate an old value into the wrong profile",
    async () => {
      localStorage.setItem("filter", "alt");
      const m = await loadModule("org-mode", {
        resolve: false,
      });
      m.profileGet("filter");

      m.release();
      await settle();

      // The unprefixed value belongs to whichever profile
      // is actually active, not to "default".
      expect(localStorage.getItem("default:filter"))
        .toBeNull();
    });
});
