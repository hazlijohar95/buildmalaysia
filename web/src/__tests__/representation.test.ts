import { describe, expect, it } from "vitest";
import { markdownPath, pageRequest } from "@/lib/representation";

const at = (path: string) => new URL(path, "https://buildmalaysia.com");
const CHROME = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

describe("pageRequest", () => {
  it("serves Markdown for a .md address, whatever the Accept header", () => {
    expect(pageRequest(at("/2025.md"), CHROME)).toEqual({ pathname: "/2025", format: "markdown" });
    expect(pageRequest(at("/2025/vote/B10.md"), null)).toEqual({ pathname: "/2025/vote/B10", format: "markdown" });
    expect(pageRequest(at("/index.md"), null)).toEqual({ pathname: "/", format: "markdown" });
  });

  it("serves Markdown on the page's own address when the client prefers it", () => {
    expect(pageRequest(at("/2025"), "text/markdown").format).toBe("markdown");
    expect(pageRequest(at("/2025"), "text/markdown, text/html;q=0.9").format).toBe("markdown");
    expect(pageRequest(at("/2025"), "text/html;q=0.5, text/markdown").format).toBe("markdown");
    expect(pageRequest(at("/2025"), "text/markdown, */*").format).toBe("markdown");
  });

  it("serves HTML to browsers and to clients that don't name Markdown or rate it lower", () => {
    expect(pageRequest(at("/2025"), CHROME)).toEqual({ pathname: "/2025", format: "html" });
    expect(pageRequest(at("/2025"), null).format).toBe("html");
    expect(pageRequest(at("/2025"), "*/*").format).toBe("html");
    expect(pageRequest(at("/2025"), "text/*").format).toBe("html");
    expect(pageRequest(at("/2025"), "text/markdown;q=0.5, text/html").format).toBe("html");
    expect(pageRequest(at("/2025"), "text/markdown;q=0").format).toBe("html");
  });
});

describe("markdownPath", () => {
  it("is the inverse of a .md request", () => {
    for (const path of ["/", "/2025", "/budget/2027/vote/B10"]) {
      expect(pageRequest(at(markdownPath(path)), null)).toEqual({ pathname: path, format: "markdown" });
    }
  });
});
