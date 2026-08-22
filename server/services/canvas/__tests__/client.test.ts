import { describe, it, expect, vi, afterEach } from "vitest";
import { CanvasClient, CanvasError, nextPageUrl } from "../client";

describe("Canvas pagination", () => {
  it("finds the next page in a Link header", () => {
    const header =
      '<https://x/api/v1/courses?page=1>; rel="current",' +
      '<https://x/api/v1/courses?page=2>; rel="next",' +
      '<https://x/api/v1/courses?page=9>; rel="last"';

    expect(nextPageUrl(header)).toBe("https://x/api/v1/courses?page=2");
  });

  it("returns null on the last page", () => {
    // Stopping here is what keeps a roster from being silently truncated.
    expect(
      nextPageUrl('<https://x/api/v1/courses?page=9>; rel="current"')
    ).toBeNull();
  });

  it("returns null when there is no Link header", () => {
    expect(nextPageUrl(null)).toBeNull();
    expect(nextPageUrl("")).toBeNull();
  });

  it("is not fooled by a malformed header", () => {
    expect(nextPageUrl('rel="next"')).toBeNull();
  });
});

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Canvas errors", () => {
  it("names a rejected token rather than reporting a bare status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(401, "Unauthorized")));

    await expect(new CanvasClient("bad", "https://x").verify()).rejects.toThrow(
      /rejected the access token/
    );
  });

  it("recognises a throttle even though Canvas sends it as 403", async () => {
    // Reported as 403 with a rate-limit body, which otherwise reads as a
    // permissions failure and sends the instructor looking in the wrong place.
    const fetchMock = vi.fn(async () => respond(403, "403 Forbidden (Rate Limit Exceeded)"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const error = await new CanvasClient("t", "https://x").verify().catch((e) => e);

    expect(error).toBeInstanceOf(CanvasError);
    expect(error.rateLimited).toBe(true);
    expect(error.message).toMatch(/rate limiting/i);
    // Retried before giving up rather than failing on the first throttle.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not treat an ordinary 403 as a throttle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(403, "Forbidden")));

    const error = await new CanvasClient("t", "https://x").verify().catch((e) => e);

    expect(error.rateLimited).toBe(false);
  });

  it("follows pagination to the end of a list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respond(200, [{ id: 1 }], { link: '<https://x/page2>; rel="next"' })
      )
      .mockResolvedValueOnce(respond(200, [{ id: 2 }]));
    vi.stubGlobal("fetch", fetchMock);

    const courses = await new CanvasClient("t", "https://x").teacherCourses();

    expect(courses.map((c) => c.id)).toEqual([1, 2]);
  });
});
