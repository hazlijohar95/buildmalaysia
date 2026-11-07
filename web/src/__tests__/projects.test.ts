import { describe, expect, it } from "vitest";
import { parseSen } from "@/lib/money";
import {
  costRises,
  largestRises,
  projectCounts,
  projectEvents,
  projectHref,
  steepestRises,
  type ProjectHistory,
  type ProjectSummary,
  type ProjectYear,
} from "@/lib/queries/projects";

const DOC = "https://example.anm.gov.my/penyata.pdf";

// Figures as the local database holds them (sen), from the FY2017-FY2022 statements.
function row(
  key: string,
  figures: { cost: number; prior: number; actual: number; toDate: number },
  previous: string[] = [],
  cumulative_matches: boolean | null = previous.length ? true : null,
): ProjectYear {
  const [year, vote, code, page] = key.split("/");
  return {
    key,
    fiscal_year: Number(year),
    vote_code: vote,
    code,
    name_ms: "PRIMA",
    total_cost_sen: parseSen(figures.cost),
    plan_actual_prior_sen: parseSen(figures.prior),
    estimate_sen: parseSen(figures.actual),
    actual_sen: parseSen(figures.actual),
    plan_actual_to_date_sen: parseSen(figures.toDate),
    prior_plan: Number(year) > 2021 ? "RMKe-12" : "RMKe-11",
    plan: Number(year) >= 2021 ? "RMKe-12" : "RMKe-11",
    doc_url: DOC,
    left: { pdf_page: Number(page), book_page: Number(page) - 12 },
    right: { pdf_page: Number(page) + 1, book_page: Number(page) - 11 },
    previous,
    cumulative_matches,
  };
}

const prima: ProjectHistory = {
  chain_id: "2022/P.43/00110/218/56",
  years: [
    row("2017/P.06/00110/219/19", { cost: 843500000000, prior: 162000000000, actual: 0, toDate: 162000000000 }),
    row(
      "2018/P.06/00110/218/21",
      { cost: 174500000100, prior: 162000000000, actual: 12500000000, toDate: 174500000000 },
      ["2017/P.06/00110/219/19"],
    ),
    row("2018/P.43/00110/242/17", { cost: 668999999900, prior: 0, actual: 37500000000, toDate: 37500000000 }),
    row(
      "2019/P.43/00110/198/75",
      { cost: 843500000000, prior: 212000000000, actual: 74195973400, toDate: 286195973400 },
      ["2018/P.06/00110/218/21", "2018/P.43/00110/242/17"],
    ),
    row(
      "2020/P.43/00110/234/44",
      { cost: 843500000000, prior: 286195973400, actual: 100000000, toDate: 286295973400 },
      ["2019/P.43/00110/198/75"],
    ),
    row("2021/P.43/00110/230/65", { cost: 0, prior: 286295973400, actual: 0, toDate: 0 }, ["2020/P.43/00110/234/44"]),
    row("2022/P.43/00110/218/56", { cost: 779304026600, prior: 0, actual: 11400000000, toDate: 11400000000 }, [
      "2021/P.43/00110/230/65",
    ]),
  ],
};

describe("projectEvents", () => {
  const events = projectEvents(prima);

  it("reads the year two rows became one as a merge, not a restatement", () => {
    expect(events.filter((e) => e.kind === "restated")).toEqual([]);
    const merged = events.filter((e) => e.kind === "merged");
    expect(merged).toHaveLength(1);
    expect(merged[0].fiscal_year).toBe(2019);
    expect(merged[0].kind === "merged" && merged[0].previous.map((p) => p.vote_code)).toEqual(["P.06", "P.43"]);
  });

  it("compares the total cost of the merged rows, so the split year is not a change", () => {
    const costs = events.filter((e) => e.kind === "cost");
    // 2017, 2018 (1,745,000,001 + 6,689,999,999), 2019 and 2020 all print RM 8,435,000,000.00.
    expect(costs.map((e) => e.fiscal_year)).toEqual([2022]);
  });

  it("skips a year that prints no total cost and compares with the last year that did", () => {
    const [change] = events.filter((e) => e.kind === "cost");
    expect(change.kind === "cost" && [change.from.fiscal_year, change.to.fiscal_year]).toEqual([2020, 2022]);
    expect(change.kind === "cost" && change.change_sen).toBe(779304026600 - 843500000000);
    expect(change.kind === "cost" && change.percent.toFixed(2)).toBe("-7.61");
  });

  it("states a restatement with what each statement printed", () => {
    // FY2018 P.62 91000 prints RM 208,182,015.38 spent to date (p251); FY2019 prints RM 1,236,967,332.82 to 2018 (p208).
    const apmm: ProjectHistory = {
      chain_id: "2019/P.62/91000/208/33",
      years: [
        row("2018/P.62/91000/250/19", { cost: 254228736900, prior: 0, actual: 20818201538, toDate: 20818201538 }),
        row(
          "2019/P.62/91000/208/33",
          { cost: 454528210000, prior: 123696733282, actual: 34396329496, toDate: 158093062778 },
          ["2018/P.62/91000/250/19"],
          false,
        ),
      ],
    };
    const [restated] = projectEvents(apmm).filter((e) => e.kind === "restated");
    expect(restated).toMatchObject({ fiscal_year: 2019, difference_sen: 123696733282 - 20818201538 });
    expect(restated.kind === "restated" && restated.previous[0].right.pdf_page).toBe(251);
    expect(restated.kind === "restated" && restated.current.left.pdf_page).toBe(208);
  });

  it("notes a move to another vote", () => {
    const moved: ProjectHistory = {
      chain_id: "2019/P.63/05011/210/34",
      years: [
        row("2018/P.64/05011/252/16", { cost: 1, prior: 0, actual: 0, toDate: 5 }),
        row("2019/P.63/05011/210/34", { cost: 1, prior: 5, actual: 0, toDate: 5 }, ["2018/P.64/05011/252/16"]),
      ],
    };
    expect(projectEvents(moved).map((e) => [e.kind, e.fiscal_year])).toEqual([["moved", 2019]]);
  });
});

function summary(chain_id: string, first: [number, number] | null, last: [number, number] | null, years = 3) {
  const [fiscal_year, vote_code, code] = chain_id.split("/");
  return {
    chain_id,
    latest: { fiscal_year: Number(fiscal_year), vote_code, code, name_ms: chain_id },
    first_year: 2016,
    years,
    restatements: 0,
    cost:
      first && last
        ? { first_year: first[0], first_sen: parseSen(first[1]), last_year: last[0], last_sen: parseSen(last[1]) }
        : null,
  } satisfies ProjectSummary;
}

describe("cost rises", () => {
  const projects = [
    summary("2025/P.27/1/1/1", [2016, 1_000_000_000_00], [2025, 3_000_000_000_00]),
    summary("2025/P.28/2/1/1", [2016, 5_000_000_00], [2025, 50_000_000_00]),
    summary("2025/P.29/3/1/1", [2016, 20_000_000_00], [2025, 10_000_000_00]),
    summary("2025/P.30/4/1/1", [2025, 9_000_000_00], [2025, 9_000_000_00]),
    summary("2025/P.31/5/1/1", null, null),
  ];
  const rises = costRises(projects);

  it("counts only a printed total cost that rose between two different years", () => {
    expect(rises.map((r) => r.project.chain_id)).toEqual(["2025/P.27/1/1/1", "2025/P.28/2/1/1"]);
  });

  it("ranks by ringgit, and by percent only above the floor", () => {
    expect(largestRises(rises, 1).map((r) => r.rise_sen)).toEqual([2_000_000_000_00]);
    expect(steepestRises(rises, 50, parseSen(10_000_000_00)).map((r) => r.percent)).toEqual([200]);
  });

  it("counts histories by how many statements print them", () => {
    const counts = projectCounts([summary("a/P.1/1", null, null, 10), summary("b/P.1/1", null, null, 2)], 10);
    expect(counts).toMatchObject({ projects: 2, spanningThree: 1, spanningAll: 1 });
  });
});

describe("projectHref", () => {
  it("uses the vote slug, as vote pages do", () => {
    expect(projectHref({ fiscal_year: 2025, vote_code: "P.43", code: "00110" })).toBe("/2025/project/P43/00110");
  });
});
