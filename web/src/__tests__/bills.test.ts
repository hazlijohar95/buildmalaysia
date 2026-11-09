import { describe, expect, it } from "vitest";
import {
  billCode,
  billHref,
  billsHref,
  houseSteps,
  lawTitle,
  outOfOrder,
  parseBillFilters,
  parseBillParams,
  supplyBudgetYear,
  type HouseRecord,
} from "@/lib/bills";

const parse = (query: string) => parseBillFilters(new URLSearchParams(query));

const house = (over: Partial<HouseRecord>): HouseRecord => ({
  house: "dewan_rakyat",
  title: "RUU Contoh 2026",
  status: "Lulus",
  firstReading: null,
  secondReading: null,
  passed: null,
  committee: null,
  failed: null,
  tabledBy: null,
  passedBy: null,
  pdfUrl: null,
  listing: "current",
  sourceUrl: "https://www.parlimen.gov.my/",
  ...over,
});

describe("parseBillFilters", () => {
  it("reads every filter", () => {
    expect(parse("q=+kewangan+&stage=enacted&year=2024&page=2")).toEqual({
      q: "kewangan",
      stage: "enacted",
      year: 2024,
      page: 2,
    });
  });

  it("falls back to the defaults for anything malformed", () => {
    expect(parse("stage=signed&year=abc&page=0")).toEqual({ q: "", stage: null, year: null, page: 1 });
  });

  it("gives each list one address", () => {
    expect(billsHref(parse(""))).toBe("/bills");
    expect(billsHref(parse("q=akta&page=3"), { stage: "passed" })).toBe("/bills?q=akta&stage=passed");
  });
});

describe("bill addresses", () => {
  it("files a bill under its year and number", () => {
    expect(billHref({ year: 2026, number: 27 })).toBe("/bills/2026/27");
    expect(billCode({ year: 2026, number: 27 })).toBe("D.R. 27/2026");
  });

  it("refuses anything that cannot be a bill", () => {
    expect(parseBillParams("2026", "27")).toEqual({ year: 2026, number: 27 });
    expect(parseBillParams("2026", "027")).toBeNull();
    expect(parseBillParams("26", "1")).toBeNull();
    expect(parseBillParams("2026", "1; drop")).toBeNull();
  });
});

describe("lawTitle", () => {
  it("reads an Act's capitals as a title, brackets included", () => {
    expect(lawTitle("AKTA PERSAINGAN (PINDAAN) 2026")).toBe("Akta Persaingan (Pindaan) 2026");
    expect(lawTitle("AKTA ORDINAN BURUH (SABAH) (PINDAAN) 2024")).toBe("Akta Ordinan Buruh (Sabah) (Pindaan) 2024");
  });
});

describe("supplyBudgetYear", () => {
  it("finds the budget a Supply Bill appropriates", () => {
    expect(supplyBudgetYear("RUU Perbekalan 2027")).toBe(2027);
    expect(supplyBudgetYear("Rang Undang-Undang Perbekalan 2013")).toBe(2013);
  });

  it("leaves out supplementary supply and every other bill", () => {
    expect(supplyBudgetYear("RUU Perbekalan Tambahan (2025) 2026")).toBeNull();
    expect(supplyBudgetYear("RUU Kewangan 2027")).toBeNull();
  });
});

describe("a house's record", () => {
  it("lists its steps in the order a bill takes them", () => {
    const steps = houseSteps(
      house({ firstReading: "2026-03-02", committee: "2026-03-05", secondReading: "2026-07-14", passed: "2026-07-15" }),
    );
    expect(steps.map((s) => s.ms)).toEqual(["Bacaan Pertama", "Dirujuk JKPK", "Bacaan Kedua", "Diluluskan"]);
  });

  it("notes dates printed out of order", () => {
    expect(outOfOrder([house({ secondReading: "2015-06-19", passed: "2015-06-16" })])).toEqual([
      "the Dewan Rakyat lists the bill as passed before its second reading",
    ]);
    expect(
      outOfOrder([
        house({ passed: "2024-12-03" }),
        house({ house: "dewan_negara", firstReading: "2024-12-02", passed: "2024-12-17" }),
      ]),
    ).toEqual(["the Dewan Negara lists its first reading before the Dewan Rakyat passed the bill"]);
    expect(outOfOrder([house({ firstReading: "2026-01-01", secondReading: "2026-02-01" })])).toEqual([]);
  });
});
