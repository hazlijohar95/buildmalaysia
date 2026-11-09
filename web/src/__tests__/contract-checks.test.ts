import { describe, expect, it } from "vitest";
import {
  QUOTATION_LIMITS,
  addDays,
  concentration,
  hhi,
  isNearLimit,
  ordinal,
  percent,
  procurementClass,
  quotationLimit,
  readSplitting,
  yearsBefore,
} from "@/lib/contract-checks";
import { contractObservations, supplierObservations } from "@/lib/contract-commentary";
import { parseSupplierSlug, supplierKey, supplierSlug, type Contract } from "@/lib/contracts";
import type { Sen } from "@/lib/money";
import type { ContractReading } from "@/lib/queries/contract";
import type { SupplierRecord } from "@/lib/queries/supplier";

const rm = (n: number) => (n * 100) as Sen;

describe("quotation limits", () => {
  it("reads the class from MyProcurement's categories", () => {
    expect(procurementClass("Kerja")).toBe("works");
    expect(procurementClass("Bekalan")).toBe("goods");
    expect(procurementClass("Perkhidmatan Bukan Perunding")).toBe("goods");
    expect(procurementClass("Bekalan Dan Perkhidmatan Bukan Perunding")).toBe("goods");
    expect(procurementClass("Perkhidmatan Perunding")).toBeNull();
  });

  it("applies the limit in force on the date", () => {
    expect(quotationLimit("Bekalan", "2019-05-01")?.sen).toBe(rm(500_000));
    expect(quotationLimit("Kerja", "2023-06-30")?.sen).toBe(rm(500_000));
    expect(quotationLimit("Kerja", "2023-07-01")?.sen).toBe(rm(1_000_000));
    expect(quotationLimit("Kerja", "2024-12-31")?.circular).toBe("pk221of2023");
    expect(quotationLimit("Kerja", "2025-06-01")).toBeNull();
    expect(quotationLimit("Kerja", "2026-03-01")?.sen).toBe(rm(3_000_000));
    expect(quotationLimit("Bekalan", "2010-01-01")).toBeNull();
  });

  it("never overlaps two limits for one class", () => {
    for (const a of QUOTATION_LIMITS)
      for (const b of QUOTATION_LIMITS) {
        if (a === b || a.class !== b.class) continue;
        expect(a.to !== null && a.to < b.from ? true : b.to !== null && b.to < a.from).toBe(true);
      }
  });

  it("counts a price as near the limit only inside the 5% band", () => {
    const limit = rm(500_000);
    expect(isNearLimit(rm(475_000), limit)).toBe(false);
    expect(isNearLimit(rm(475_001), limit)).toBe(true);
    expect(isNearLimit(rm(500_000), limit)).toBe(true);
    expect(isNearLimit(rm(500_001), limit)).toBe(false);
    expect(isNearLimit(null, limit)).toBe(false);
  });
});

describe("splitting", () => {
  const limit = rm(500_000);
  it("is raised when several quotations each under the limit pass it together", () => {
    expect(readSplitting([rm(300_000), rm(250_000)], limit)).toEqual({ count: 2, total: rm(550_000), raised: true });
  });
  it("is not raised for one quotation, a total under the limit, or one already over it", () => {
    expect(readSplitting([rm(499_000)], limit).raised).toBe(false);
    expect(readSplitting([rm(200_000), rm(200_000)], limit).raised).toBe(false);
    expect(readSplitting([rm(600_000), rm(100_000)], limit).raised).toBe(false);
    expect(readSplitting([rm(400_000), null, rm(200_000)], limit).count).toBe(2);
  });
});

describe("concentration", () => {
  it("computes the Herfindahl-Hirschman Index", () => {
    expect(hhi([1])).toBe(10_000);
    expect(hhi([1, 1, 1, 1])).toBeCloseTo(2_500);
    expect(hhi(Array(100).fill(1))).toBeCloseTo(100);
    expect(hhi([])).toBe(0);
  });
  it("bands it as the 2023 Merger Guidelines do", () => {
    expect(concentration(999)).toBe("low");
    expect(concentration(1000)).toBe("moderate");
    expect(concentration(1800)).toBe("moderate");
    expect(concentration(1801)).toBe("high");
  });
});

describe("formatting and dates", () => {
  it("writes ordinals and percentages", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "111th",
    ]);
    expect(percent(0.0412)).toBe("4.1%");
    expect(percent(0.613)).toBe("61%");
    expect(percent(0.0004)).toBe("under 0.1%");
  });
  it("moves dates across months and leap years", () => {
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDays("2026-01-15", -30)).toBe("2025-12-16");
    expect(yearsBefore("2026-05-25", 3)).toBe("2023-05-25");
  });
});

describe("company names", () => {
  it("treats punctuation and spacing variants as one company", () => {
    expect(supplierKey("LOYAL ENGINEERING SDN. BHD.")).toBe(supplierKey("Loyal Engineering Sdn Bhd"));
    expect(supplierSlug("M.S. ALLY PHARMA SDN. BHD.")).toBe("m-s-ally-pharma-sdn-bhd");
  });
  it("reads a slug back to the same key", () => {
    const name = "BEST METRO BUILDER SDN. BHD.";
    expect(parseSupplierSlug(supplierSlug(name))?.key).toBe(supplierKey(name));
    expect(parseSupplierSlug("Not-A-Slug")).toBeNull();
    expect(parseSupplierSlug("a--b")).toBeNull();
  });
});

const contract = (over: Partial<Contract> = {}): Contract => ({
  kind: "quotation",
  id: 1,
  reference: "QT1",
  title: "MEMBEKAL UBAT",
  ministry: "KEMENTERIAN KESIHATAN",
  agency: "HOSPITAL KAJANG",
  category: "Bekalan",
  dated: "2026-05-01",
  resultDated: true,
  criterion: null,
  sourceUrl: "https://myprocurement.treasury.gov.my/",
  awards: [{ ordinal: 1, supplier: "SYARIKAT A SDN. BHD.", amount: rm(490_000) }],
  total: rm(490_000),
  ...over,
});

const reading = (over: Partial<ContractReading> = {}): ContractReading => ({
  year: { number: 2026, contracts: 200, total: rm(49_000_000), rank: 12, histogram: [] },
  peers: { contracts: 1000, below: 970 },
  market: {
    from: "2023-05-01",
    contracts: 40,
    suppliers: 3,
    total: rm(2_000_000),
    hhi: 4200,
    top: [],
    lead: { key: "SYARIKATASDNBHD", name: "SYARIKAT A SDN. BHD.", value: rm(1_300_000), contracts: 20 },
  },
  nearby: [contract({ id: 1, total: rm(490_000) }), contract({ id: 2, total: rm(300_000) })],
  winner: {
    name: "SYARIKAT A SDN. BHD.",
    fromBuyer: { contracts: 14, value: rm(5_200_000), first: "2019-02-01" },
    overall: { contracts: 60, value: rm(9_000_000) },
  },
  ...over,
});

describe("contract commentary", () => {
  it("raises the patterns this quotation shows, each with its formula's anchor", () => {
    const obs = contractObservations(contract(), reading());
    const ids = obs.map((o) => o.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "rank",
        "peers",
        "near-limit",
        "splitting",
        "market-share",
        "concentration",
        "relationship",
      ]),
    );
    expect(obs.find((o) => o.id === "near-limit")?.headline).toContain(
      "RM\u00a010,000.00 under the RM\u00a0500,000.00 limit",
    );
    expect(obs.find((o) => o.id === "near-limit")?.detail).toContain("98.0%");
    expect(obs.find((o) => o.id === "market-share")?.tone).toBe("question");
    expect(obs.every((o) => o.method.length > 0)).toBe(true);
    expect(obs.filter((o) => o.tone === "question").every((o) => o.otherwise)).toBe(true);
  });

  it("holds back ranks and shares below the minimum sizes", () => {
    const obs = contractObservations(
      contract(),
      reading({
        year: { number: 2026, contracts: 9, total: rm(1_000_000), rank: 1, histogram: [] },
        market: { ...reading().market, contracts: 9 },
      }),
    );
    expect(obs.map((o) => o.id)).not.toEqual(expect.arrayContaining(["rank"]));
    expect(obs.some((o) => o.id === "market-share" || o.id === "concentration")).toBe(false);
  });

  it("raises direct negotiation with the recorded reason, and not the quotation checks", () => {
    const obs = contractObservations(
      contract({ kind: "direct", reference: null, criterion: "Keperluan Mendesak", total: rm(490_000) }),
      reading({ nearby: null }),
    );
    expect(obs.find((o) => o.id === "direct")?.detail).toContain("Keperluan Mendesak");
    expect(obs.some((o) => o.id === "near-limit" || o.id === "splitting")).toBe(false);
  });

  it("says largest rather than 1st, and never rounds a share up to 100%", () => {
    const obs = contractObservations(
      contract({ total: rm(499_810.5) }),
      reading({ year: { ...reading().year, rank: 1 }, peers: { contracts: 1833, below: 1832 } }),
    );
    expect(obs.find((o) => o.id === "rank")?.headline).toMatch(/^The largest of the 200 contracts/);
    expect(obs.find((o) => o.id === "peers")?.headline).toMatch(/^The largest of the 1,833 quotations/);
    expect(obs.find((o) => o.id === "near-limit")?.detail).toContain("99.96%");
    const near = contractObservations(contract(), reading({ peers: { contracts: 2000, below: 1998 } }));
    expect(near.find((o) => o.id === "peers")?.headline).toContain("Larger than 99%");
  });

  it("names the ministry, and skips the buyer checks, when no buyer is printed", () => {
    const obs = contractObservations(contract({ agency: "" }), reading());
    expect(obs.some((o) => ["market-share", "concentration", "relationship", "splitting"].includes(o.id))).toBe(false);
    expect(JSON.stringify(obs)).not.toContain("from  ");
  });

  it("never uses accusatory words", () => {
    const text = JSON.stringify(contractObservations(contract(), reading())).toLowerCase();
    for (const word of ["suspicious", "corrupt", "rigged", "crony", "fraud"]) expect(text).not.toContain(word);
  });
});

describe("company commentary", () => {
  const record = (over: Partial<SupplierRecord> = {}): SupplierRecord => ({
    names: ["SYARIKAT A SDN. BHD."],
    contracts: 30,
    value: rm(10_000_000),
    first: "2019-01-01",
    last: "2026-01-01",
    byKind: {
      tender: { contracts: 5, value: rm(6_000_000) },
      quotation: { contracts: 20, value: rm(3_000_000) },
      direct: { contracts: 5, value: rm(1_000_000) },
    },
    nearLimit: 6,
    directCriteria: [{ criterion: "Satu Punca", contracts: 5 }],
    years: [],
    ministries: [],
    buyers: [
      {
        agency: "HOSPITAL KAJANG",
        ministry: "KEMENTERIAN KESIHATAN",
        value: rm(6_000_000),
        contracts: 12,
        buyerTotal: rm(10_000_000),
      },
    ],
    largest: [],
    latest: [],
    ...over,
  });

  it("reads near-limit quotations against the base rate", () => {
    const obs = supplierObservations(record(), { quotations: 1000, near: 80 });
    const near = obs.find((o) => o.id === "company-near-limit");
    expect(near?.tone).toBe("question"); // 30% against 8%
    expect(near?.headline).toContain("6 of its 20 quotations");
    const calm = supplierObservations(record({ nearLimit: 2 }), { quotations: 1000, near: 80 });
    expect(calm.find((o) => o.id === "company-near-limit")?.tone).toBe("context");
  });

  it("raises a buyer that gives the company most of its business", () => {
    const obs = supplierObservations(record(), { quotations: 1000, near: 80 });
    expect(obs.find((o) => o.id === "company-top-buyer")?.tone).toBe("question");
    expect(obs.find((o) => o.id === "company-direct")?.detail).toContain("Satu Punca");
  });
});
