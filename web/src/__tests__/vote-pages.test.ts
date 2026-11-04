import { describe, it, expect } from "vitest";
import { formatRinggit, money } from "@/components/Figures";
import { yearSpans } from "@/components/VoteNav";
import { otherNames, printedVoteName } from "@/lib/queries/vote-nav";
import { parseSen } from "@/lib/money";

describe("printedVoteName", () => {
  it("reads a name printed on the vote's own line", () => {
    expect(printedVoteName("P.70 Simpanan Luar Jangka 0 0 2,000,000,000 2,000,000,000")).toBe("Simpanan Luar Jangka");
    expect(printedVoteName("P. 70 Simpanan Luar Jangka 0 0 2,000,000,000 2,000,000,000")).toBe("Simpanan Luar Jangka");
  });

  it("ignores the line kind printed under a ministry heading", () => {
    expect(printedVoteName("B.63 Mengurus 54,554,493,627 57,866,817,941 59,884,100,700 63,473,399,800")).toBeNull();
    expect(printedVoteName("P. 15 Pembangunan 0 3,339,196,916 2,940,748,300 2,437,448,500")).toBeNull();
    expect(printedVoteName("Jumlah 13,532,639 13,532,893 13,533,000 13,533,000")).toBeNull();
  });
});

describe("formatRinggit", () => {
  it("drops .00 from whole ringgit", () => {
    expect(formatRinggit(parseSen(200_000_000_000))).toBe("RM\u00a02,000,000,000");
  });

  it("keeps sen when a figure has them", () => {
    expect(formatRinggit(parseSen(1_353_277_240))).toBe("RM\u00a013,532,772.40");
  });
});

describe("money", () => {
  it("is compact with the exact figure as its title from RM 1 million", () => {
    expect(money(parseSen(5_786_960_000_000))).toEqual({
      value: "RM\u00a057.87\u00a0bn",
      title: "RM\u00a057,869,600,000.00",
    });
    expect(money(parseSen(5_786_960_000_000), true).title).toBe("RM\u00a057,869,600,000");
  });

  it("shows smaller figures exactly", () => {
    expect(money(parseSen(375_927))).toEqual({ value: "RM\u00a03,759.27" });
  });
});

describe("yearSpans", () => {
  it("joins consecutive years", () => {
    expect(yearSpans([2018, 2021, 2022, 2023, 2025])).toBe("2018, 2021–2023, 2025");
  });
});

describe("otherNames", () => {
  it("lists names other than the current one, ignoring case and spacing", () => {
    const years = [
      { year: 2021, name_ms: "KEMENTERIAN ALAM SEKITAR DAN AIR" },
      { year: 2022, name_ms: "KEMENTERIAN ALAM SEKITAR DAN AIR" },
      { year: 2025, name_ms: "Kementerian  Peralihan Tenaga" },
    ];
    expect(otherNames(years, "KEMENTERIAN PERALIHAN TENAGA")).toEqual([
      { name_ms: "KEMENTERIAN ALAM SEKITAR DAN AIR", years: [2021, 2022] },
    ]);
  });
});
