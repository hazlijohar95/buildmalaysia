// /economy: the economy the federal budget sits in, from data.gov.my's open data (CC BY 4.0), with federal spending
// as a share of GDP worked out from the audited statements and DOSM's nominal GDP. Every chart names the dataset it
// reads and links to it; nothing on the page is typed in.
import { Band, H2, PageHeader, StatRow, kicker } from "@/components/Boxed";
import StackedBars from "@/components/StackedBars";
import { notFound } from "@/lib/abort";
import { cn } from "@/lib/cn";
import { formatSenCompact, parseSen } from "@/lib/money";
import {
  DATAGOVMY_LICENCE,
  byYear,
  fieldUnit,
  getIndicatorDatasets,
  getSeries,
  shareOf,
  SERIES as KEYS,
  type IndicatorDataset,
  type SeriesId,
} from "@/lib/queries/economy";
import { getSpendingByYear } from "@/lib/queries/spending";
import type { Page } from "@/lib/route";
import { SERIES } from "@/styles/charts/series";

const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;
/** RM million as published, shown the way the rest of the site shows ringgit. */
const rmMillion = (v: number) => formatSenCompact(parseSen(Math.round(v * 100_000_000)));

const whole = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 });

const IDS = ["gdpNominal", "gdpRealGrowth", "inflation", "unemployment", "debt", "balance"] as const;

function DatasetCredit({ d, measure }: { d: IndicatorDataset | undefined; measure?: string }) {
  if (!d) return null;
  const field = d.fields.find((f) => f.name === measure);
  return (
    <p className="mt-4 text-sm text-charcoal-700">
      Source:{" "}
      <a href={d.pageUrl} target="_blank" rel="noopener noreferrer">
        {d.title}
      </a>{" "}
      ({d.publisher.join(", ")}, via data.gov.my, <code>{d.id}</code>
      {field ? `, column ${field.name}: ${field.description}` : ""}). Retrieved {d.retrievedAt.slice(0, 10)};
      data.gov.my last updated it {d.lastUpdated}.
    </p>
  );
}

export default async function economyPage(): Promise<Page> {
  const [datasets, series, spending] = await Promise.all([getIndicatorDatasets(), getSeries(IDS), getSpendingByYear()]);
  if (datasets.size === 0 || spending.length === 0) notFound();

  const years = spending.map((s) => s.fiscal_year);
  const latest = years[years.length - 1];
  const map = Object.fromEntries(IDS.map((id) => [id, byYear(series[id])])) as Record<SeriesId, Map<number, number>>;
  const gdp = map.gdpNominal;
  const spendingRm = new Map(spending.map((s) => [s.fiscal_year, s.total_actual_sen / 100_000_000])); // RM million
  const spendingShare = shareOf(years, spendingRm, gdp);
  const debtShare = shareOf(years, map.debt, gdp);
  const balanceShare = shareOf(years, map.balance, gdp);
  const ds = (id: SeriesId) => datasets.get(KEYS[id].dataset);
  const at = (id: SeriesId, y: number) => map[id].get(y);

  const bars = (values: (number | undefined | null)[]) =>
    years.flatMap((year, i) => {
      const v = values[i];
      return v === undefined || v === null ? [] : [{ year, values: [v] }];
    });

  const latestStats = [
    at("gdpNominal", latest) !== undefined && {
      label: `GDP, ${latest}`,
      value: rmMillion(at("gdpNominal", latest)!),
      sub: "nominal, at current prices",
    },
    at("gdpRealGrowth", latest) !== undefined && {
      label: "Real growth",
      value: pct(at("gdpRealGrowth", latest)!),
      sub: `GDP at constant prices, ${latest} on ${latest - 1}`,
    },
    at("inflation", latest) !== undefined && {
      label: "Inflation",
      value: pct(at("inflation", latest)!),
      sub: `consumer prices, ${latest} on ${latest - 1}`,
    },
    at("unemployment", latest) !== undefined && {
      label: "Unemployment",
      value: pct(at("unemployment", latest)!),
      sub: `of the labour force, ${latest}`,
    },
  ].filter((s) => s !== false);

  const lastShare = spendingShare[spendingShare.length - 1];

  return {
    head: {
      title: "The economy",
      description:
        "Malaysia's GDP, inflation, unemployment and federal debt from data.gov.my, beside federal spending from the audited statements as a share of GDP.",
    },
    body: (
      <>
        <PageHeader
          eyebrow="Economy · data.gov.my open data"
          title="The economy around the budget"
          intro={
            <p>
              Growth, prices, jobs and debt, as the Department of Statistics (DOSM), Bank Negara Malaysia (BNM) and the
              Accountant General (JANM) publish them on{" "}
              <a href="https://data.gov.my/data-catalogue" target="_blank" rel="noopener noreferrer">
                data.gov.my
              </a>
              , for the years this site has audited statements for: {years[0]} to {latest}.
            </p>
          }
        />

        {latestStats.length > 0 && <StatRow stats={latestStats} />}

        <Band id="spending-share">
          <H2>Federal spending as a share of GDP</H2>
          <p className="mt-3 max-w-3xl text-lg text-charcoal-800">
            {lastShare !== null && lastShare !== undefined
              ? `In ${latest} the federal government spent the equivalent of ${pct(lastShare)} of nominal GDP.`
              : "Federal spending set against nominal GDP, year by year."}{" "}
            Spending here is the site&apos;s total from the audited statements: operating spending less its transfer to
            the Development Fund, plus development spending, plus the COVID-19 Fund (see{" "}
            <a href="/spending">where the money went</a>). The transfer is left out because the money it moves is spent
            again as development spending; data.gov.my&apos;s own operating figure leaves it out too.
          </p>
          <div className="mt-10">
            <StackedBars
              label="Federal spending as a percentage of nominal GDP, by year"
              format={(v) => pct(v)}
              series={[{ label: "Federal spending, % of nominal GDP", color: SERIES[0].hex }]}
              rows={bars(spendingShare)}
            />
          </div>
          <p className="mt-4 text-sm text-charcoal-700">
            Spending: Jabatan Akauntan Negara, <em>Penyata Kewangan Kerajaan Persekutuan</em>; each year&apos;s page on
            this site (linked in the table below) cites the statement pages it is read from.
          </p>
          <DatasetCredit d={ds("gdpNominal")} measure="gdp" />
        </Band>

        <Band>
          <H2>Gross domestic product</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            The value of what Malaysia produced each year, at current prices.
          </p>
          <div className="mt-10">
            <StackedBars
              label="Nominal GDP by year"
              format={rmMillion}
              series={[{ label: "Nominal GDP", color: SERIES[1].hex }]}
              rows={bars(years.map((y) => gdp.get(y)))}
            />
          </div>
          <DatasetCredit d={ds("gdpNominal")} measure="gdp" />

          <H2 className="mt-16">Real growth</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            How much more Malaysia produced than the year before, with price changes taken out.
          </p>
          <div className="mt-10">
            <StackedBars
              label="Real GDP growth by year, percent"
              format={(v) => pct(v)}
              series={[{ label: "Real GDP growth, % on the year before", color: SERIES[2].hex }]}
              rows={bars(years.map((y) => at("gdpRealGrowth", y)))}
            />
          </div>
          <DatasetCredit d={ds("gdpRealGrowth")} />
        </Band>

        <Band>
          <H2>Inflation</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            The change in the consumer price index, all goods and services, on the year before.
          </p>
          <div className="mt-10">
            <StackedBars
              label="Consumer price inflation by year, percent"
              format={(v) => pct(v)}
              series={[{ label: "Inflation, % on the year before", color: SERIES[3].hex }]}
              rows={bars(years.map((y) => at("inflation", y)))}
            />
          </div>
          <DatasetCredit d={ds("inflation")} measure="inflation" />

          <H2 className="mt-16">Unemployment</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">The share of the labour force without work and looking.</p>
          <div className="mt-10">
            <StackedBars
              label="Unemployment rate by year, percent"
              format={(v) => pct(v)}
              series={[{ label: "Unemployment rate", color: SERIES[4].hex }]}
              rows={bars(years.map((y) => at("unemployment", y)))}
            />
          </div>
          <DatasetCredit d={ds("unemployment")} measure="u_rate" />
        </Band>

        <Band>
          <H2>Federal government debt</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            Debt outstanding at the end of each year, domestic and external, at nominal value.
          </p>
          <div className="mt-10">
            <StackedBars
              label="Federal government debt by year"
              format={rmMillion}
              series={[{ label: "Federal government debt", color: SERIES[5].hex }]}
              rows={bars(years.map((y) => at("debt", y)))}
            />
          </div>
          <DatasetCredit d={ds("debt")} measure="value" />

          <H2 className="mt-16">Debt and the budget balance as a share of GDP</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            Debt and the overall balance (revenue less operating, net development and COVID-19 Fund spending, as
            data.gov.my defines it) set against nominal GDP. A negative balance is a deficit.
          </p>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <StackedBars
              label="Federal debt as a percentage of nominal GDP, by year"
              format={(v) => pct(v)}
              series={[{ label: "Debt, % of nominal GDP", color: SERIES[5].hex }]}
              rows={bars(debtShare)}
            />
            <StackedBars
              label="Federal budget balance as a percentage of nominal GDP, by year"
              format={(v) => pct(v)}
              series={[{ label: "Balance, % of nominal GDP", color: SERIES[6].hex }]}
              rows={bars(balanceShare)}
            />
          </div>
          <DatasetCredit d={ds("balance")} measure="value" />
        </Band>

        <Band wide>
          <H2>Every figure</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            Rounded for reading: ringgit figures to the whole RM million (
            {fieldUnit(ds("gdpNominal")?.fields.find((f) => f.name === "gdp")) ?? "RM mil"} in the source), rates to one
            decimal place. The three shares of GDP divide one published figure by another. The{" "}
            <a href="/developers">API</a> returns every figure exactly as data.gov.my publishes it.
          </p>
          <div className="table-scroll mt-8">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="text-right">Nominal GDP (RM mil)</th>
                  <th className="text-right">Real growth</th>
                  <th className="text-right">Inflation</th>
                  <th className="text-right">Unemployment</th>
                  <th className="text-right">Federal spending, % of GDP</th>
                  <th className="text-right">Debt (RM mil)</th>
                  <th className="text-right">Debt, % of GDP</th>
                  <th className="text-right">Balance (RM mil)</th>
                  <th className="text-right">Balance, % of GDP</th>
                </tr>
              </thead>
              <tbody>
                {[...years].reverse().map((y) => {
                  const i = years.indexOf(y);
                  const v = (id: SeriesId) => at(id, y);
                  const mil = (id: SeriesId) => (v(id) === undefined ? "–" : whole.format(v(id)!));
                  const rate = (id: SeriesId) => (v(id) === undefined ? "–" : pct(v(id)!));
                  const share = (x: number | null) => (x === null ? "–" : pct(x));
                  return (
                    <tr key={y}>
                      <td>
                        <a href={`/${y}`}>{y}</a>
                      </td>
                      <td className="num">{mil("gdpNominal")}</td>
                      <td className="num">{rate("gdpRealGrowth")}</td>
                      <td className="num">{rate("inflation")}</td>
                      <td className="num">{rate("unemployment")}</td>
                      <td className="num">{share(spendingShare[i])}</td>
                      <td className="num">{mil("debt")}</td>
                      <td className="num">{share(debtShare[i])}</td>
                      <td className="num">{mil("balance")}</td>
                      <td className="num">{share(balanceShare[i])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Band>

        <Band id="sources">
          <H2>Sources</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            Contains data from data.gov.my, published under the{" "}
            <a href={DATAGOVMY_LICENCE.url} target="_blank" rel="noopener noreferrer">
              {DATAGOVMY_LICENCE.name}
            </a>{" "}
            licence, as each dataset&apos;s catalogue page states. Each was read through data.gov.my&apos;s open API and
            is loaded as published; the shares of GDP are the only figures worked out here.
          </p>
          <ul className="mt-8 grid gap-6 md:grid-cols-2">
            {[...datasets.values()].map((d) => (
              <li key={d.id} className="border-t-2 border-foreground pt-4">
                <div className={cn(kicker, "text-charcoal-700")}>{d.publisher.join(", ")}</div>
                <a href={d.pageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block font-medium">
                  {d.title}
                </a>
                <p className="mt-1 text-sm text-charcoal-700">{d.description}</p>
                <p className="mt-2 text-xs text-charcoal-600">
                  <code>{d.id}</code> · retrieved {d.retrievedAt.slice(0, 10)} · updated {d.lastUpdated} ·{" "}
                  <a href={d.apiUrl}>API</a>
                  {d.csvUrl && (
                    <>
                      {" "}
                      · <a href={d.csvUrl}>CSV</a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Band>
      </>
    ),
  };
}
