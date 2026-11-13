import { describe, expect, it } from "vitest";
import {
  bandsProblem,
  calculateTax,
  compare,
  currentBands,
  formatBands,
  MAX_BANDS,
  parseBands,
  SCHEDULE,
  scenarioRules,
} from "@/lib/tax";

// Chargeable income of exactly `x` with no KWSP: income is x plus the individual relief.
const at = (x: number) => calculateTax({ income: x + SCHEDULE.reliefs.individual.amount, epf: false, otherReliefs: 0 });

describe("calculateTax", () => {
  it("matches the tax LHDN prints at each band boundary", () => {
    // "Cukai (RM)" on the first N ringgit, from the YA2023-2025 table.
    expect(at(50_000).tax).toBe(1_500);
    expect(at(70_000).tax).toBe(3_700);
    expect(at(100_000).tax).toBe(9_400);
    expect(at(400_000).tax).toBe(84_400);
    expect(at(600_000).tax).toBe(136_400);
    expect(at(2_000_000).tax).toBe(528_400);
  });

  it("applies the RM400 rebate only below RM35,000 chargeable income", () => {
    expect(at(20_000)).toMatchObject({ taxBeforeRebate: 150, rebate: 150, tax: 0 });
    expect(at(34_999)).toMatchObject({ taxBeforeRebate: 599.97, rebate: 400, tax: 199.97 });
    expect(at(35_000)).toMatchObject({ taxBeforeRebate: 600, rebate: 0, tax: 600 });
  });

  it("caps KWSP relief at RM4,000 and counts the contribution against take-home pay", () => {
    const low = calculateTax({ income: 30_000, epf: true, otherReliefs: 0 });
    expect(low.epfContribution).toBe(3_300);
    expect(low.chargeable).toBe(30_000 - 9_000 - 3_300);

    const high = calculateTax({ income: 120_000, epf: true, otherReliefs: 0 });
    expect(high.epfContribution).toBe(13_200);
    expect(high.chargeable).toBe(120_000 - 9_000 - 4_000);
    expect(high.takeHome).toBe(120_000 - high.tax - 13_200);
  });

  it("reports the top band reached as the marginal rate", () => {
    const r = calculateTax({ income: 120_000, epf: true, otherReliefs: 0 });
    expect(r.marginalRatePct).toBe(25);
    expect(r.slices.filter((s) => s.taxable > 0).map((s) => s.band)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  });

  it("owes nothing when reliefs exceed income", () => {
    expect(calculateTax({ income: 8_000, epf: true, otherReliefs: 0 })).toMatchObject({
      chargeable: 0,
      tax: 0,
      marginalRatePct: 0,
    });
  });
});

describe("a reader's own bands", () => {
  it("round-trips the published bands through the URL parameter", () => {
    const text = formatBands(currentBands());
    expect(text).toBe("0:0,5000:1,20000:3,35000:6,50000:11,70000:19,100000:25,400000:26,600000:28,2000000:30");
    expect(parseBands(text)).toEqual(currentBands());
  });

  it("taxes exactly as the published schedule when the bands are unchanged", () => {
    for (const income of [20_000, 60_000, 250_000, 3_000_000]) {
      const input = { income, epf: true, otherReliefs: 0 };
      expect(calculateTax(input, scenarioRules(currentBands())).tax).toBe(calculateTax(input).tax);
    }
    expect(compare([60_000, 500_000], { epf: true, otherReliefs: 0 }, currentBands()).map((c) => c.difference)).toEqual(
      [0, 0],
    );
  });

  it("charges a reader's flat rate on all chargeable income above the rebate", () => {
    const flat = [{ lower: 0, ratePct: 10 }];
    const r = calculateTax({ income: 109_000, epf: false, otherReliefs: 0 }, scenarioRules(flat));
    expect(r.chargeable).toBe(100_000);
    expect(r.tax).toBe(10_000);
  });

  it("accepts rates to two decimal places, including ones floating point cannot hold exactly", () => {
    expect(parseBands("0:1.1,5000:2.55,9000:0.29")).toEqual([
      { lower: 0, ratePct: 1.1 },
      { lower: 5000, ratePct: 2.55 },
      { lower: 9000, ratePct: 0.29 },
    ]);
    expect(bandsProblem([{ lower: 0, ratePct: 1.234 }])).toMatch(/two decimal places/);
  });

  it("refuses a parameter that is not a schedule", () => {
    for (const text of [null, "", "5000:1", "0:1,0:2", "0:1,9000:2,5000:3", "0:101", "0:-1", "0:1;5000:2", "x"]) {
      expect(parseBands(text)).toBeNull();
    }
    const many = Array.from({ length: MAX_BANDS + 1 }, (_, i) => `${i * 1000}:1`).join(",");
    expect(parseBands(many)).toBeNull();
  });
});
