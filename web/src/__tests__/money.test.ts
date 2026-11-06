import { describe, it, expect } from "vitest";
import { parseSen, formatSen, formatSenCompact, utilisation } from "@/lib/money";

describe("parseSen", () => {
  it("parses a string integer", () => {
    expect(parseSen("760200000")).toBe(760_200_000);
  });

  it("parses a plain number", () => {
    expect(parseSen(133700000)).toBe(133_700_000);
  });

  it("parses a bigint", () => {
    expect(parseSen(BigInt("12000000000"))).toBe(12_000_000_000);
  });

  it("parses zero", () => {
    expect(parseSen("0")).toBe(0);
  });

  it("parses negative sen (supplementary reduction)", () => {
    expect(parseSen("-12150000")).toBe(-12_150_000);
  });

  it("throws on non-numeric string", () => {
    expect(() => parseSen("not-a-number")).toThrow(RangeError);
  });
});

describe("formatSen", () => {
  it("formats 13 532 772.40 RM correctly", () => {
    // 1,353,277,240 sen = RM 13,532,772.40
    const result = formatSen(parseSen("1353277240"));
    expect(result).toBe("RM 13,532,772.40");
  });

  it("formats 114 780 590.80 RM (T.03 actual) correctly", () => {
    const result = formatSen(parseSen("11478059080"));
    expect(result).toBe("RM 114,780,590.80");
  });

  it("formats zero", () => {
    expect(formatSen(parseSen("0"))).toBe("RM 0.00");
  });

  it("formats negative values with leading minus", () => {
    const result = formatSen(parseSen("-12150000"));
    expect(result).toBe("-RM 121,500.00");
  });

  it("includes sen (cents) in two decimal places", () => {
    // 760,198,615 sen = RM 7,601,986.15
    expect(formatSen(parseSen("760198615"))).toBe("RM 7,601,986.15");
  });
});

describe("formatSenCompact", () => {
  it("formats millions as m", () => {
    // 12,000,000,000 sen = RM 120,000,000
    const result = formatSenCompact(parseSen("12000000000"));
    expect(result).toBe("RM 120.00 m");
  });

  it("formats billions as bn", () => {
    // 100 billion RM = 10,000,000,000,000 sen
    const result = formatSenCompact(parseSen("10000000000000"));
    expect(result).toBe("RM 100.00 bn");
  });

  it("groups thousands of billions", () => {
    // RM 1,179,750,000,000 = 117,975,000,000,000 sen
    expect(formatSenCompact(parseSen("117975000000000"))).toBe("RM 1,179.75 bn");
  });

  it("falls back to full format for small amounts", () => {
    const result = formatSenCompact(parseSen("90040000"));
    // 900,400 RM — less than 1 million, full format
    expect(result).toBe("RM 900,400.00");
  });

  it("formats negative compact correctly", () => {
    const result = formatSenCompact(parseSen("-12000000000"));
    expect(result).toBe("-RM 120.00 m");
  });
});

describe("utilisation", () => {
  it("computes T.03 vote utilisation", () => {
    const pct = utilisation(parseSen("12000000000"), parseSen("11478059080"));
    expect(pct).toBe(95.65);
  });

  it("returns 0 when revised is 0", () => {
    expect(utilisation(parseSen("0"), parseSen("0"))).toBe(0);
  });

  it("returns 100.00 when actual equals revised", () => {
    expect(utilisation(parseSen("56400000"), parseSen("56400000"))).toBe(100);
  });

  it("returns over 100 when actual exceeds revised", () => {
    const pct = utilisation(parseSen("100"), parseSen("150"));
    expect(pct).toBeGreaterThan(100);
  });
});
