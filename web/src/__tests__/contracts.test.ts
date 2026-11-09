import { describe, expect, it } from "vitest";
import { contractsHref, parseContractFilters } from "@/lib/contracts";

const parse = (query: string) => parseContractFilters(new URLSearchParams(query));

describe("parseContractFilters", () => {
  it("reads every filter", () => {
    expect(parse("q=+ubat+&kind=tender&ministry=KEMENTERIAN%20KESIHATAN&year=2024&sort=newest&page=3")).toEqual({
      q: "ubat",
      kind: "tender",
      ministry: "KEMENTERIAN KESIHATAN",
      year: 2024,
      sort: "newest",
      page: 3,
    });
  });

  it("falls back to the defaults for anything malformed", () => {
    expect(parse("kind=bribe&year=twenty&sort=drop&page=-1&ministry=%20")).toEqual({
      q: "",
      kind: null,
      ministry: null,
      year: null,
      sort: "value",
      page: 1,
    });
    expect(parse("year=1850&page=1.5").year).toBeNull();
  });

  it("caps the query's length", () => {
    expect(parse(`q=${"a".repeat(500)}`).q).toHaveLength(100);
  });
});

describe("contractsHref", () => {
  const base = parse("q=ubat&year=2024&page=4");

  it("leaves out defaults and resets to page 1 when a filter changes", () => {
    expect(contractsHref(base, { kind: "quotation" })).toBe("/contracts?q=ubat&kind=quotation&year=2024");
    expect(contractsHref(parse(""))).toBe("/contracts");
  });

  it("keeps the page only when asked", () => {
    expect(contractsHref(base, { page: 5 })).toBe("/contracts?q=ubat&year=2024&page=5");
    expect(contractsHref(base, { sort: "newest" })).toBe("/contracts?q=ubat&year=2024&sort=newest");
  });
});
