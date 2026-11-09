// Runs the contract and company queries against a loaded database: DATABASE_URL=postgresql:///buildmalaysia pnpm test.
// Skipped without one, as in CI.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { withRequestScope } from "@/lib/db";
import { getContract, getContractReading } from "@/lib/queries/contract";
import { getLimitReading, getSupplier, getSupplierNames } from "@/lib/queries/supplier";
import { supplierSlug } from "@/lib/contracts";
import sql from "@/lib/db";

const url = process.env.DATABASE_URL;
if (url) (env as unknown as Record<string, unknown>).HYPERDRIVE = { connectionString: url };

const inScope = <T>(run: () => Promise<T>) =>
  withRequestScope(async () => {
    try {
      return await run();
    } finally {
      await sql.end();
    }
  });

describe.skipIf(!url)("contract and company queries", () => {
  it("reads a quotation's contract, context and nearby quotations", async () => {
    const out = await inScope(async () => {
      const [pick] = await sql<{ kind: string; id: string }[]>`
        select kind, id::text from procurement_notice where kind = 'quotation' and category = 'Bekalan'
          and total_sen between 47500000 and 50000000 order by dated desc limit 1`;
      const c = await getContract(pick.kind, pick.id);
      if (!c) throw new Error("no contract");
      return { c, reading: await getContractReading(c) };
    });
    expect(out.c.awards.length).toBeGreaterThan(0);
    expect(out.reading.year.rank).toBeGreaterThanOrEqual(1);
    expect(out.reading.year.rank).toBeLessThanOrEqual(out.reading.year.contracts);
    expect(out.reading.year.histogram.reduce((s, [, n]) => s + n, 0)).toBe(out.reading.year.contracts);
    expect(out.reading.nearby?.some((n) => n.id === out.c.id)).toBe(true);
    expect(out.reading.market.hhi).toBeGreaterThan(0);
    expect(out.reading.market.hhi).toBeLessThanOrEqual(10_000.0001);
    expect(out.reading.winner?.overall.contracts).toBeGreaterThan(0);
  });

  it("rejects malformed addresses", async () => {
    expect(await inScope(() => getContract("bribe", "1"))).toBeNull();
    expect(await inScope(() => getContract("tender", "1; drop"))).toBeNull();
    expect(await inScope(() => getSupplier("Not A Slug"))).toBeNull();
    expect(await inScope(() => getSupplierNames("Not A Slug"))).toEqual([]);
    expect(await inScope(() => getSupplierNames("zzzz-not-a-company"))).toEqual([]);
  });

  it("gathers a company's record under every spelling of its name", async () => {
    const record = await inScope(async () => {
      const [top] = await sql<{ supplier: string }[]>`
        select max(supplier) as supplier from procurement_award
        group by regexp_replace(upper(supplier), '[^A-Z0-9]+', '', 'g') order by count(*) desc limit 1`;
      const slug = supplierSlug(top.supplier);
      const [names, record] = await Promise.all([getSupplierNames(slug), getSupplier(slug)]);
      expect(names).toEqual([...(record?.names ?? [])].sort());
      return record;
    });
    expect(record).not.toBeNull();
    const r = record!;
    const byKind = r.byKind.tender.contracts + r.byKind.quotation.contracts + r.byKind.direct.contracts;
    expect(byKind).toBe(r.contracts);
    expect(r.years.reduce((s, y) => s + y.contracts, 0)).toBe(r.contracts);
    expect(r.buyers[0].buyerTotal).toBeGreaterThanOrEqual(r.buyers[0].value * 0.5);
    expect(r.largest.length).toBeGreaterThan(0);
    expect(r.first <= r.last).toBe(true);
  });

  it("counts quotations bunched under the tender limit", async () => {
    const base = await inScope(() => getLimitReading());
    const bins = base.bins;
    const sum = (from: number, to: number) =>
      bins.filter((x) => x.bin >= from && x.bin < to).reduce((s, x) => s + x.count, 0);
    expect(sum(95, 100)).toBeGreaterThan(sum(100, 105) * 5); // just under the limit against just over it
    expect(sum(95, 100)).toBe(base.near); // the chart's band is exactly the check
    expect(base.near).toBeGreaterThan(0);
    expect(base.near).toBeLessThan(base.quotations);
  });
});
