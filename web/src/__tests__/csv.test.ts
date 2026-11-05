import { describe, it, expect } from "vitest";
import { senToRm, buildCsv } from "@/lib/csv";
import { DATASETS } from "@/lib/datasets";

describe("senToRm", () => {
  it("converts a typical positive amount", () => {
    expect(senToRm("1353277240")).toBe("13532772.40");
  });

  it("converts zero", () => {
    expect(senToRm("0")).toBe("0.00");
  });

  it("converts a negative amount (supplementary reduction)", () => {
    expect(senToRm("-12150000")).toBe("-121500.00");
  });

  it("converts a large amount without floating-point error", () => {
    // 10 trillion sen = RM 100 billion; floats lose precision here
    expect(senToRm("1000000000000")).toBe("10000000000.00");
  });

  it("pads single-digit cents correctly", () => {
    // 101 sen = RM 1.01
    expect(senToRm("101")).toBe("1.01");
  });

  it("returns null for null input", () => {
    expect(senToRm(null)).toBeNull();
  });
});

describe("buildCsv", () => {
  it("produces a header row and one data row", () => {
    const csv = buildCsv(["a", "b"], [{ a: "hello", b: "world" }]);
    // Strip the BOM for comparison
    const withoutBom = csv.slice(1);
    expect(withoutBom).toBe("a,b\r\nhello,world\r\n");
  });

  it("prepends a UTF-8 BOM", () => {
    const csv = buildCsv(["x"], [{ x: "1" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("produces only the header row for an empty row list", () => {
    const csv = buildCsv(["a", "b"], []);
    expect(csv).toBe("﻿a,b\r\n");
  });

  it("quotes a cell containing a comma", () => {
    const csv = buildCsv(["name"], [{ name: "Supplies, Equipment" }]);
    expect(csv).toContain('"Supplies, Equipment"');
  });

  it("quotes a cell containing a double-quote and doubles the quote inside", () => {
    const csv = buildCsv(["val"], [{ val: 'say "hello"' }]);
    expect(csv).toContain('"say ""hello"""');
  });

  it("quotes a cell containing a newline", () => {
    const csv = buildCsv(["desc"], [{ desc: "line1\nline2" }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null cells as empty strings", () => {
    const csv = buildCsv(["a", "b"], [{ a: null, b: "x" }]);
    expect(csv).toContain(",x");
    // 'a' column is empty: starts the row
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe(",x");
  });

  it("renders number cells as their string representation", () => {
    const csv = buildCsv(["n"], [{ n: 42 }]);
    expect(csv).toContain("42");
  });
});

describe("DATASETS registry", () => {
  it("contains the seven expected datasets", () => {
    expect(DATASETS.size).toBe(7);
    const ids = [...DATASETS.keys()];
    expect(ids).toContain("operating-lines");
    expect(ids).toContain("development-projects");
    expect(ids).toContain("revenue-lines");
    expect(ids).toContain("covid-fund");
    expect(ids).toContain("budget-operating-lines");
    expect(ids).toContain("budget-development-projects");
    expect(ids).toContain("budget-vote-figures");
  });

  it("returns undefined for an unknown dataset id", () => {
    expect(DATASETS.get("does-not-exist")).toBeUndefined();
  });

  it("every dataset has at least one column", () => {
    for (const ds of DATASETS.values()) {
      expect(ds.columns.length).toBeGreaterThan(0);
    }
  });

  it("every column has a description", () => {
    for (const ds of DATASETS.values()) {
      for (const col of ds.columns) {
        expect(ds.columnDescriptions[col], `${ds.id}: missing description for column '${col}'`).toBeTruthy();
      }
    }
  });
});
