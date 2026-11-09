import { describe, expect, it, vi } from "vitest";
import { sharedFor } from "@/lib/db";

describe("sharedFor", () => {
  it("keeps a value for its lifetime, then loads it again", async () => {
    vi.useFakeTimers();
    let loads = 0;
    const get = sharedFor(1000, async () => ++loads);
    expect(await get()).toBe(1);
    expect(await get()).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await get()).toBe(2);
    vi.useRealTimers();
  });

  it("does not keep a failure", async () => {
    let calls = 0;
    const get = sharedFor(1000, async () => {
      if (++calls === 1) throw new Error("down");
      return "up";
    });
    await expect(get()).rejects.toThrow("down");
    expect(await get()).toBe("up");
  });
});
