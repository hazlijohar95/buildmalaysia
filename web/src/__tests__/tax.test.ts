import { describe, expect, it } from "vitest";
import { calculateTax, SCHEDULE } from "@/lib/tax";

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
    expect(calculateTax({ income: 8_000, epf: true, otherReliefs: 0 })).toMatchObject({ chargeable: 0, tax: 0, marginalRatePct: 0 });
  });
});
