import { describe, it, expect } from "vitest";
import { nextPageUrl } from "../services/canvas/client";

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
    const header =
      '<https://x/api/v1/courses?page=9>; rel="current",' +
      '<https://x/api/v1/courses?page=1>; rel="first"';

    expect(nextPageUrl(header)).toBeNull();
  });

  it("returns null when there is no Link header at all", () => {
    expect(nextPageUrl(null)).toBeNull();
    expect(nextPageUrl("")).toBeNull();
  });

  it("is not fooled by a malformed header", () => {
    expect(nextPageUrl('rel="next"')).toBeNull();
  });
});
