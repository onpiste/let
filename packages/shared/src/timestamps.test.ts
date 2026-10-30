import { describe, expect, it } from "vitest";

import {
  messageCreatedAt,
  needsTimeDivider,
  TIME_DIVIDER_GAP_MS
} from "./timestamps";

describe("messageCreatedAt", () => {
  it("reads a numeric createdAt", () => {
    expect(messageCreatedAt({ metadata: { createdAt: 5 } })).toBe(5);
  });

  it("ignores missing or malformed metadata", () => {
    expect(messageCreatedAt({})).toBeUndefined();
    expect(messageCreatedAt({ metadata: "x" })).toBeUndefined();
    expect(messageCreatedAt({ metadata: { createdAt: "5" } })).toBeUndefined();
  });
});

describe("needsTimeDivider", () => {
  it("fires at the gap and not below it", () => {
    expect(needsTimeDivider(0, TIME_DIVIDER_GAP_MS)).toBe(true);
    expect(needsTimeDivider(0, TIME_DIVIDER_GAP_MS - 1)).toBe(false);
  });

  it("stays quiet when either time is unknown", () => {
    expect(needsTimeDivider(undefined, 10 ** 9)).toBe(false);
    expect(needsTimeDivider(0, undefined)).toBe(false);
  });
});
