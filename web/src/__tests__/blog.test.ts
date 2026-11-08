import { describe, expect, it } from "vitest";
import { coverUrl, readingMinutes } from "@/lib/blog";

const paragraph = (words: number) => ({ _type: "block", children: [{ text: Array(words).fill("ringgit").join(" ") }] });

describe("readingMinutes", () => {
  it("counts the words in text blocks at 230 a minute", () => {
    expect(readingMinutes([paragraph(460), paragraph(230)])).toBe(3);
  });

  it("ignores images and is never below one minute", () => {
    expect(readingMinutes([{ _type: "image" }])).toBe(1);
    expect(readingMinutes(undefined)).toBe(1);
  });
});

describe("coverUrl", () => {
  it("prefers an explicit src", () => {
    expect(coverUrl({ src: "https://example.com/a.png", meta: { storageKey: "b.png" } })).toBe(
      "https://example.com/a.png",
    );
  });

  it("builds the media route from a stored file's key", () => {
    expect(coverUrl({ provider: "local", meta: { storageKey: "01ABC.png" } })).toBe(
      "/_emdash/api/media/file/01ABC.png",
    );
  });

  it("has no URL for an external provider without src, or no cover", () => {
    expect(coverUrl({ provider: "cloudflare-images", meta: { storageKey: "x" } })).toBeUndefined();
    expect(coverUrl(undefined)).toBeUndefined();
  });
});
