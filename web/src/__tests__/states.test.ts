import { describe, expect, it } from "vitest";
import { parseSen } from "@/lib/money";
import {
  percentOf,
  stateCitationLabel,
  stateHref,
  summarise,
  transferNote,
  type PrintedFigure,
  type StateStatement,
} from "@/lib/states";

const statement: StateStatement = {
  id: "perak-penyata-kewangan-2024",
  slug: "perak",
  name: "Perak",
  nameMs: "Perak",
  year: 2024,
  publisher: "Pejabat Kewangan Negeri Perak",
  title: "Penyata Kewangan Kerajaan Negeri Perak Darul Ridzuan 2024",
  url: "https://example.org/perak.pdf",
};

const fig = (over: Partial<PrintedFigure>): PrintedFigure => ({
  section: "operating",
  label: "x",
  scope: "statement",
  category: null,
  original: null,
  revised: null,
  actual: parseSen(100),
  prior: null,
  pdfPage: 1,
  ...over,
});

describe("summarise", () => {
  it("takes each section's statement total and the printed transfer", () => {
    const s = summarise(statement, [
      fig({ section: "revenue", label: "JUMLAH HASIL", actual: parseSen(500) }),
      fig({ section: "operating", label: "PERBELANJAAN MENGURUS (sebelum caruman)", scope: "statement_less_transfer" }),
      fig({ section: "operating", label: "PERBELANJAAN MENGURUS (selepas caruman)", actual: parseSen(300) }),
      fig({ section: "operating", label: "CARUMAN", scope: "transfer", actual: parseSen(200_000_000) }),
    ]);
    expect(s?.revenue.actual).toBe(500);
    expect(s?.operating.actual).toBe(300);
    expect(s?.transferIn).toBe("votes");
    expect(s && transferNote(s)).toBe("Includes RM\u00a02.00\u00a0m moved to the state's Development Fund");
  });

  it("says when the votes leave the transfer out", () => {
    const s = summarise(statement, [
      fig({ section: "revenue" }),
      fig({ section: "operating" }),
      fig({ section: "operating", scope: "statement_plus_transfer" }),
      fig({ section: "operating", scope: "transfer", actual: parseSen(150) }),
    ]);
    expect(s && transferNote(s)).toBe("Excludes RM\u00a01.50 moved to the state's Development Fund");
  });

  it("needs both sections", () => {
    expect(summarise(statement, [fig({ section: "revenue" })])).toBeNull();
  });

  it("gives no note without a printed transfer", () => {
    const s = summarise(statement, [fig({ section: "revenue" }), fig({ section: "operating" })]);
    expect(s && transferNote(s)).toBeNull();
  });
});

describe("helpers", () => {
  it("cites the state, year and PDF page", () => {
    expect(stateCitationLabel("Sabah", 2024, 43)).toBe("Sabah 2024, PDF p.\u00a043");
  });
  it("links a state's page, with the year only when asked", () => {
    expect(stateHref("pulau-pinang")).toBe("/states/pulau-pinang");
    expect(stateHref("melaka", 2023)).toBe("/states/melaka?year=2023");
  });
  it("shows actual against the estimate", () => {
    expect(percentOf(parseSen(50), parseSen(200))).toBe("25.0%");
    expect(percentOf(parseSen(50), null)).toBe("–");
    expect(percentOf(parseSen(50), parseSen(0))).toBe("–");
  });
});
