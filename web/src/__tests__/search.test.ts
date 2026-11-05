import { describe, it, expect } from "vitest";
import { escapeWildcard, expandSynonyms, rankHits, SYNONYMS, type SearchHit } from "@/lib/search";
import { parseSen } from "@/lib/money";

describe("escapeWildcard", () => {
  it("escapes a percent sign", () => {
    expect(escapeWildcard("100%")).toBe("100\\%");
  });

  it("escapes an underscore", () => {
    expect(escapeWildcard("vote_code")).toBe("vote\\_code");
  });

  it("escapes a backslash", () => {
    expect(escapeWildcard("a\\b")).toBe("a\\\\b");
  });

  it("escapes all three in one string", () => {
    expect(escapeWildcard("100%_\\x")).toBe("100\\%\\_\\\\x");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeWildcard("pendidikan")).toBe("pendidikan");
  });

  it("leaves a vote code unchanged", () => {
    expect(escapeWildcard("B.63")).toBe("B.63");
  });
});

describe("expandSynonyms", () => {
  it("returns only the original term when no synonym matches", () => {
    expect(expandSynonyms("pendidikan")).toEqual(["pendidikan"]);
  });

  it("adds the Malay synonym for a known English word", () => {
    const result = expandSynonyms("education");
    expect(result).toContain("education");
    expect(result).toContain("pendidikan");
  });

  it("is case-insensitive for the English word", () => {
    const result = expandSynonyms("HEALTH");
    expect(result).toContain("HEALTH");
    expect(result).toContain("kesihatan");
  });

  it("substitutes the matched word when query has surrounding text", () => {
    const result = expandSynonyms("ministry of health");
    expect(result).toContain("ministry of health");
    expect(result).toContain("kesihatan");
  });

  it("matches whole words only", () => {
    expect(expandSynonyms("transport")).toEqual(["transport", "pengangkutan"]);
  });

  it("deduplicates when input word matches its own synonym", () => {
    // 'hospital' maps to 'hospital' in the table, so expansion produces the same string.
    const result = expandSynonyms("hospital");
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("handles a term not in the synonym table", () => {
    expect(expandSynonyms("jabatan")).toEqual(["jabatan"]);
  });

  it("covers every key in SYNONYMS without throwing", () => {
    for (const key of Object.keys(SYNONYMS)) {
      expect(() => expandSynonyms(key)).not.toThrow();
    }
  });
});

function makeHit(overrides: Partial<SearchHit> & Pick<SearchHit, "kind">): SearchHit {
  const base = {
    name_ms: "TEST",
    code: "00",
    fiscal_year: 2025,
    href: "/test",
    actual_sen: parseSen(0),
  };
  if (overrides.kind === "ministry") {
    return { ...base, ...overrides } as SearchHit;
  }
  return { ...base, vote_name_ms: "VOTE", ...overrides } as SearchHit;
}

describe("rankHits", () => {
  it("places an exact code match first regardless of kind", () => {
    const hits: SearchHit[] = [
      makeHit({ kind: "programme", code: "010000", vote_name_ms: "V" }),
      makeHit({ kind: "vote", code: "B.63" }),
    ];
    const ranked = rankHits(hits, "B.63");
    expect(ranked[0].code).toBe("B.63");
  });

  it("matches a code without its dot (URL slug form)", () => {
    const hits: SearchHit[] = [
      makeHit({ kind: "programme", code: "010000", vote_name_ms: "V" }),
      makeHit({ kind: "vote", code: "B.63" }),
    ];
    const ranked = rankHits(hits, "B63");
    expect(ranked[0].code).toBe("B.63");
  });

  it("orders kinds as ministry > vote > programme > activity > project when no code match", () => {
    const hits: SearchHit[] = [
      makeHit({ kind: "project", code: "00001", vote_name_ms: "V" }),
      makeHit({ kind: "programme", code: "010000", vote_name_ms: "V" }),
      makeHit({ kind: "vote", code: "B.01" }),
      makeHit({ kind: "activity", code: "010100", vote_name_ms: "V" }),
      makeHit({ kind: "ministry", code: "1" }),
    ];
    const ranked = rankHits(hits, "pendidikan");
    expect(ranked.map((h) => h.kind)).toEqual(["ministry", "vote", "programme", "activity", "project"]);
  });

  it("sorts by spending desc within the same kind", () => {
    const hits: SearchHit[] = [
      makeHit({ kind: "vote", code: "B.01", actual_sen: parseSen(100_000_000) }),
      makeHit({ kind: "vote", code: "B.02", actual_sen: parseSen(500_000_000) }),
      makeHit({ kind: "vote", code: "B.03", actual_sen: parseSen(200_000_000) }),
    ];
    const ranked = rankHits(hits, "pendidikan");
    expect(ranked.map((h) => h.code)).toEqual(["B.02", "B.03", "B.01"]);
  });

  it("does not mutate the original array", () => {
    const hits: SearchHit[] = [makeHit({ kind: "vote", code: "B.02" }), makeHit({ kind: "ministry", code: "2" })];
    const original = [...hits];
    rankHits(hits, "q");
    expect(hits[0].code).toBe(original[0].code);
  });
});
