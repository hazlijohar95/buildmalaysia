import { describe, expect, it } from "vitest";
import { budgetMoves, MIN_PERCENT_BASE, type VoteComparison, type VoteHolding } from "@/lib/budget-moves";
import { reorganisedBetween, type BodyLineage } from "@/lib/lineage";
import { parseSen } from "@/lib/money";

const RM = (ringgit: number) => parseSen(ringgit * 100);
const MILLION = 1_000_000;

const steady: BodyLineage = { id: "steady", established: null, dissolved: null, edgeYears: [] };

function vote(voteCode: string, base: number, proposed: number, holdings?: VoteHolding[]): VoteComparison {
  return {
    voteCode,
    name: `Vote ${voteCode}`,
    base: RM(base),
    proposed: RM(proposed),
    pdfPage: 30,
    bookPage: 20,
    holdings: holdings ?? [{ body: { ...steady, id: voteCode }, from: 2016, to: null }],
  };
}

const codes = (moves: { voteCode: string }[]) => moves.map((m) => m.voteCode);

describe("reorganisedBetween", () => {
  it("counts an edge, an establishment or a dissolution inside the span, ends included", () => {
    expect(reorganisedBetween({ ...steady, edgeYears: [2023] }, 2023, 2025)).toBe(true);
    expect(reorganisedBetween({ ...steady, established: 2025 }, 2023, 2025)).toBe(true);
    expect(reorganisedBetween({ ...steady, dissolved: 2024 }, 2023, 2025)).toBe(true);
  });

  it("ignores changes outside the span", () => {
    expect(
      reorganisedBetween({ ...steady, edgeYears: [2018, 2022], established: 2020, dissolved: 2026 }, 2023, 2025),
    ).toBe(false);
  });
});

describe("budgetMoves", () => {
  it("ranks rises and falls by ringgit, largest first", () => {
    const moves = budgetMoves(
      [
        vote("B.01", 500 * MILLION, 600 * MILLION),
        vote("B.02", 500 * MILLION, 900 * MILLION),
        vote("B.03", 500 * MILLION, 300 * MILLION),
        vote("B.04", 500 * MILLION, 450 * MILLION),
      ],
      2027,
    );
    expect(codes(moves.byAmount.rose)).toEqual(["B.02", "B.01"]);
    expect(codes(moves.byAmount.fell)).toEqual(["B.03", "B.04"]);
    expect(moves.byAmount.rose[0]).toMatchObject({ change: RM(400 * MILLION), percent: 80 });
    expect(moves.byAmount.fell[0]).toMatchObject({ change: RM(-200 * MILLION), percent: -40 });
  });

  it("leaves unchanged votes out of both lists", () => {
    const moves = budgetMoves([vote("T.04", 900_400, 900_400)], 2027);
    expect(moves.byAmount).toEqual({ rose: [], fell: [] });
  });

  it("breaks a tie by vote code", () => {
    const moves = budgetMoves(
      [
        vote("P.20", 500 * MILLION, 600 * MILLION),
        vote("B.20", 500 * MILLION, 600 * MILLION),
        vote("B.10", 500 * MILLION, 600 * MILLION),
      ],
      2027,
    );
    expect(codes(moves.byAmount.rose)).toEqual(["B.10", "B.20", "P.20"]);
    expect(codes(moves.byPercent.rose)).toEqual(["B.10", "B.20", "P.20"]);
  });

  it("keeps only the top of each list", () => {
    const votes = Array.from({ length: 6 }, (_, i) => vote(`B.0${i + 1}`, 500 * MILLION, (510 + i) * MILLION));
    const moves = budgetMoves(votes, 2027, { amount: 3, percent: 2 });
    expect(codes(moves.byAmount.rose)).toEqual(["B.06", "B.05", "B.04"]);
    expect(codes(moves.byPercent.rose)).toEqual(["B.06", "B.05"]);
  });

  it("ranks percentages only for bases of at least RM 100 million", () => {
    const moves = budgetMoves(
      [
        vote("B.04", 64 * MILLION, 165 * MILLION), // +157%, too small a base
        vote("B.31", 150 * MILLION, 230 * MILLION), // +53%
        vote("B.11", 38_000 * MILLION, 61_000 * MILLION), // +61%
        vote("P.14", MIN_PERCENT_BASE / 100, 66 * MILLION),
        vote("P.25", 72 * MILLION, 59 * MILLION),
      ],
      2027,
    );
    expect(codes(moves.byPercent.rose)).toEqual(["B.11", "B.31"]);
    expect(codes(moves.byPercent.fell)).toEqual(["P.14"]);
    expect(codes(moves.byAmount.rose)).toContain("B.04");
    expect(codes(moves.byAmount.fell)).toContain("P.25");
  });

  it("gives a new vote no percentage and keeps it out of the percentage ranking", () => {
    const moves = budgetMoves([vote("B.50", 0, 200 * MILLION)], 2027);
    expect(moves.byAmount.rose[0].percent).toBeNull();
    expect(moves.byPercent.rose).toEqual([]);
  });

  it("leaves out a vote whose body was reorganised from the year the current budget was tabled", () => {
    const reorganised: BodyLineage = { ...steady, id: "nres", edgeYears: [2023] };
    const votes = [
      vote("B.23", 1_700 * MILLION, 1_360 * MILLION, [{ body: reorganised, from: 2016, to: null }]),
      vote("B.63", 59_000 * MILLION, 63_000 * MILLION),
    ];
    expect(budgetMoves(votes, 2025)).toMatchObject({
      reorganised: ["B.23"],
      byAmount: { rose: [{ voteCode: "B.63" }], fell: [] },
    });
    // By Budget 2026 the 2023 reorganisation is outside the window, and the vote compares again.
    expect(codes(budgetMoves(votes, 2026).byAmount.fell)).toEqual(["B.23"]);
  });

  it("leaves out a vote number another body held during the window", () => {
    const kasa: BodyLineage = { ...steady, id: "kasa" };
    const petra: BodyLineage = { ...steady, id: "petra" };
    const b33 = vote("B.33", 340 * MILLION, 362 * MILLION, [
      { body: kasa, from: 2020, to: 2023 },
      { body: petra, from: 2024, to: null },
    ]);
    expect(budgetMoves([b33], 2025).reorganised).toEqual(["B.33"]);
    expect(budgetMoves([b33], 2026).reorganised).toEqual([]);
  });

  it("counts a reorganised vote even when its figures did not move", () => {
    const moved: BodyLineage = { ...steady, established: 2026 };
    const moves = budgetMoves(
      [vote("B.50", 200 * MILLION, 200 * MILLION, [{ body: moved, from: 2026, to: null }])],
      2027,
    );
    expect(moves.reorganised).toEqual(["B.50"]);
  });
});
