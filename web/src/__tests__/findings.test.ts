import { describe, expect, it } from "vitest";
import { parseSen } from "@/lib/money";
import {
  FINDINGS,
  debtServiceTemplate,
  developmentDeliveryTemplate,
  emolumenTemplate,
  largestProjectTemplate,
  supplementaryTemplate,
  topGrowthMinistryTemplate,
  type FindingDef,
} from "@/lib/findings";

// Fixed sen values that match the cross-checked FY2025 figures from the DB.
const T13_ACTUAL = parseSen("5371108336334"); // RM 53.71 bn
const FEDERAL_TOTAL = parseSen("41269634171998"); // RM 412.70 bn
const T13_EARLIEST = parseSen("2647961758168"); // RM 26.48 bn (2016)
const EMOLUMEN = parseSen("10145134501471"); // RM 101.45 bn
const OPERATING = parseSen("33606926296850"); // RM 336.07 bn
const DEV_ACTUAL = parseSen("8192052611341"); // RM 81.92 bn
const DEV_ESTIMATE = parseSen("8386772362000"); // RM 83.87 bn
const PROJECT_ACTUAL = parseSen("769172764760"); // RM 7.69 bn
const SUPP = parseSen("-253855706000"); // -RM 2.54 bn
const GROWTH_CURR = parseSen("16357466017"); // RM 163.57 m
const GROWTH_PREV = parseSen("7169205000"); // RM 71.69 m

const DOC_URL = "https://example.anm.gov.my/penyata2025.pdf";
const BASE_SOURCE = { docUrl: DOC_URL, pdfPage: 100, bookPage: 90 };

describe("debtServiceTemplate", () => {
  const f = debtServiceTemplate({
    id: "debt-service",
    year: 2025,
    actual: T13_ACTUAL,
    totalFederal: FEDERAL_TOTAL,
    earliestYear: 2016,
    earliestActual: T13_EARLIEST,
    ...BASE_SOURCE,
  });

  it("sets the correct id", () => {
    expect(f.id).toBe("debt-service");
  });

  it("includes the share percentage in the body", () => {
    // 5371108336334 / 41269634171998 * 100 = 13.0%
    expect(f.body).toContain("13.0%");
  });

  it("mentions the earliest year for comparison", () => {
    expect(f.body).toContain("2016");
  });

  it("links to the vote page for T.13", () => {
    expect(f.href).toBe("/2025/vote/T13");
  });

  it("includes compact actual in headline", () => {
    expect(f.headline).toContain("bn");
  });

  it("carries source citation with the correct pages", () => {
    expect(f.source).toMatchObject({ pdfPage: 100, bookPage: 90, year: 2025 });
  });
});

describe("emolumenTemplate", () => {
  const f = emolumenTemplate({
    id: "emolumen",
    year: 2025,
    actual: EMOLUMEN,
    operatingActual: OPERATING,
    ...BASE_SOURCE,
  });

  it("sets the correct id", () => {
    expect(f.id).toBe("emolumen");
  });

  it("includes the share percentage in the headline", () => {
    // 10145134501471 / 33606926296850 * 100 = 30.2%
    expect(f.headline).toContain("30.2%");
  });

  it("links to the year operating page", () => {
    expect(f.href).toBe("/2025/operating");
  });

  it("body mentions object group 10000 and Emolumen", () => {
    expect(f.body).toContain("10000");
    expect(f.body).toContain("Emolumen");
  });
});

describe("developmentDeliveryTemplate", () => {
  const f = developmentDeliveryTemplate({
    id: "development-delivery",
    year: 2025,
    actual: DEV_ACTUAL,
    estimate: DEV_ESTIMATE,
    ...BASE_SOURCE,
  });

  it("sets the correct id", () => {
    expect(f.id).toBe("development-delivery");
  });

  it("includes the delivery percentage in the headline", () => {
    // 8192052611341 / 8386772362000 * 100 = 97.7%
    expect(f.headline).toContain("97.7%");
  });

  it("links to the year development page", () => {
    expect(f.href).toBe("/2025/development");
  });
});

describe("largestProjectTemplate", () => {
  const f = largestProjectTemplate({
    id: "largest-project",
    year: 2025,
    projectName: "Pelbagai Suntikan Modal",
    voteCode: "P.10",
    voteName: "PERBENDAHARAAN",
    actual: PROJECT_ACTUAL,
    ...BASE_SOURCE,
  });

  it("sets the correct id", () => {
    expect(f.id).toBe("largest-project");
  });

  it("headline is the project name as printed", () => {
    expect(f.headline).toBe("Pelbagai Suntikan Modal");
  });

  it("body mentions vote code and vote name", () => {
    expect(f.body).toContain("P.10");
    expect(f.body).toContain("PERBENDAHARAAN");
  });

  it("links to the vote detail page", () => {
    expect(f.href).toBe("/2025/vote/P10");
  });

  it("marks source as a spread", () => {
    expect(f.source?.spread).toBe(true);
  });
});

describe("supplementaryTemplate", () => {
  it("shows net reduction when supplementary is negative", () => {
    const f = supplementaryTemplate({ id: "supplementary", year: 2025, supplementary: SUPP, ...BASE_SOURCE });
    expect(f.body).toContain("reduced");
    expect(f.headline).toMatch(/^-/);
  });

  it("shows net addition when supplementary is positive", () => {
    const pos = parseSen("347555190000"); // FY2024 value
    const f = supplementaryTemplate({ id: "supplementary", year: 2024, supplementary: pos, ...BASE_SOURCE });
    expect(f.body).toContain("increased");
    expect(f.headline).not.toMatch(/^-/);
  });

  it("links to /spending", () => {
    const f = supplementaryTemplate({ id: "supplementary", year: 2025, supplementary: SUPP, ...BASE_SOURCE });
    expect(f.href).toBe("/spending");
  });
});

describe("topGrowthMinistryTemplate", () => {
  const f = topGrowthMinistryTemplate({
    id: "top-growth-ministry",
    year: 2025,
    priorYear: 2024,
    name: "SURUHANJAYA PILIHAN RAYA",
    operatingVoteCode: "B.04",
    currentActual: GROWTH_CURR,
    priorActual: GROWTH_PREV,
    ...BASE_SOURCE,
  });

  it("sets the correct id", () => {
    expect(f.id).toBe("top-growth-ministry");
  });

  it("headline is the percentage growth with leading +", () => {
    // (16357466017 - 7169205000) / 7169205000 * 100 = 128.2%
    expect(f.headline).toBe("+128.2%");
  });

  it("body mentions vote code and both years", () => {
    expect(f.body).toContain("B.04");
    expect(f.body).toContain("2024");
    expect(f.body).toContain("2025");
  });

  it("links to the ministry slug page", () => {
    expect(f.href).toBe("/ministries/suruhanjaya-pilihan-raya");
  });
});

describe("FINDINGS registry", () => {
  it("contains the expected finding ids in order", () => {
    expect(FINDINGS.map((f) => f.id)).toEqual([
      "debt-service",
      "emolumen",
      "development-delivery",
      "largest-project",
      "supplementary",
      "top-growth-ministry",
    ]);
  });

  it("load() returns null when the loader data is null", async () => {
    const def: FindingDef = {
      id: "null-test",
      async load() {
        return null;
      },
    };
    expect(await def.load(2025)).toBeNull();
  });

  it("all FINDINGS have distinct ids", () => {
    const ids = FINDINGS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
