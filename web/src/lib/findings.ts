import { voteCodeToSlug } from "@/lib/citations";
import { formatSenCompact, parseSen, type Sen } from "@/lib/money";
import { slugify } from "@/lib/slug";
import {
  getDebtServiceData,
  getDevelopmentDeliveryData,
  getEmolumenData,
  getLargestProjectData,
  getSupplementaryData,
  getTopGrowthMinistryData,
  type DebtServiceData,
  type DevelopmentDeliveryData,
  type EmolumenData,
  type LargestProjectData,
  type SupplementaryData,
  type TopGrowthMinistryData,
} from "@/lib/queries/findings";

export interface FindingSource {
  docUrl: string;
  pdfPage: number;
  bookPage: number;
  year: number;
  /** True when the row is printed across a two-page spread starting at pdfPage. */
  spread?: boolean;
}

export interface Finding {
  id: string;
  kicker: string;
  headline: string;
  body: string;
  href: string;
  source: FindingSource | null;
}

export interface FindingDef {
  id: string;
  load(year: number): Promise<Finding | null>;
}

// --- Pure template functions ---
// Each takes only computed values so the output text is unit-testable without DB access.

export interface DebtServiceTemplateParams {
  id: string;
  year: number;
  actual: Sen;
  totalFederal: Sen;
  earliestYear: number;
  earliestActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function debtServiceTemplate(p: DebtServiceTemplateParams): Finding {
  const sharePct = ((p.actual / p.totalFederal) * 100).toFixed(1);
  return {
    id: p.id,
    kicker: "T.13 · HUTANG NEGARA",
    headline: formatSenCompact(p.actual),
    body: `Perbelanjaan Kerana Hutang Negara (debt service) was ${sharePct}% of total federal spending in ${p.year}. The same vote stood at ${formatSenCompact(p.earliestActual)} in ${p.earliestYear}.`,
    href: `/${p.year}/vote/${voteCodeToSlug("T.13")}`,
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year },
  };
}

export interface EmolumenTemplateParams {
  id: string;
  year: number;
  actual: Sen;
  operatingActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function emolumenTemplate(p: EmolumenTemplateParams): Finding {
  const sharePct = ((p.actual / p.operatingActual) * 100).toFixed(1);
  return {
    id: p.id,
    kicker: "10000 · EMOLUMEN",
    headline: `${sharePct}% of operating spending`,
    body: `Object group 10000 (Emolumen — salaries and allowances for federal employees) totalled ${formatSenCompact(p.actual)} in ${p.year}, out of ${formatSenCompact(p.operatingActual)} in gross operating expenditure.`,
    href: `/${p.year}/operating`,
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year },
  };
}

export interface DevelopmentDeliveryTemplateParams {
  id: string;
  year: number;
  actual: Sen;
  estimate: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function developmentDeliveryTemplate(p: DevelopmentDeliveryTemplateParams): Finding {
  const pct = ((p.actual / p.estimate) * 100).toFixed(1);
  return {
    id: p.id,
    kicker: "LAMPIRAN 2 · DEVELOPMENT",
    headline: `${pct}% of estimate delivered`,
    body: `Development expenditure (Penyata Perbelanjaan Pembangunan) reached ${formatSenCompact(p.actual)} against an estimate of ${formatSenCompact(p.estimate)} in ${p.year}.`,
    href: `/${p.year}/development`,
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year },
  };
}

export interface LargestProjectTemplateParams {
  id: string;
  year: number;
  projectName: string;
  voteCode: string;
  voteName: string;
  actual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function largestProjectTemplate(p: LargestProjectTemplateParams): Finding {
  return {
    id: p.id,
    kicker: "PROJEK TERBESAR · LARGEST PROJECT LINE",
    headline: p.projectName,
    body: `${p.projectName} under ${p.voteName} (${p.voteCode}) was the largest project line in Lampiran 2, with actual spending of ${formatSenCompact(p.actual)} in ${p.year}.`,
    href: `/${p.year}/vote/${voteCodeToSlug(p.voteCode)}`,
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year, spread: true },
  };
}

export interface SupplementaryTemplateParams {
  id: string;
  year: number;
  supplementary: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function supplementaryTemplate(p: SupplementaryTemplateParams): Finding {
  const absFormatted = formatSenCompact(parseSen(Math.abs(p.supplementary)));
  const direction = p.supplementary >= 0 ? "increased" : "reduced";
  return {
    id: p.id,
    kicker: "TAMBAHAN/(KURANGAN) · SUPPLEMENTARY",
    headline: formatSenCompact(p.supplementary),
    body: `The operating budget was ${direction} by ${absFormatted} through the Tambahan/(Kurangan) column in ${p.year}, reflecting net adjustments after the original budget was passed.`,
    href: "/spending",
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year },
  };
}

export interface TopGrowthMinistryTemplateParams {
  id: string;
  year: number;
  priorYear: number;
  name: string;
  operatingVoteCode: string;
  currentActual: Sen;
  priorActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export function topGrowthMinistryTemplate(p: TopGrowthMinistryTemplateParams): Finding {
  const pct = (((p.currentActual - p.priorActual) / p.priorActual) * 100).toFixed(1);
  return {
    id: p.id,
    kicker: "PERTUMBUHAN TERTINGGI · FASTEST GROWTH",
    headline: `+${pct}%`,
    body: `${p.name} (${p.operatingVoteCode}) grew from ${formatSenCompact(p.priorActual)} in ${p.priorYear} to ${formatSenCompact(p.currentActual)} in ${p.year}, the largest percentage increase among ministries not reorganised between the two years.`,
    href: `/ministries/${slugify(p.name)}`,
    source: { docUrl: p.docUrl, pdfPage: p.pdfPage, bookPage: p.bookPage, year: p.year },
  };
}

// --- Registry ---

function fromDebtService(d: DebtServiceData): Finding {
  return debtServiceTemplate({ id: "debt-service", ...d });
}

function fromEmolumen(d: EmolumenData): Finding {
  return emolumenTemplate({ id: "emolumen", ...d });
}

function fromDevelopmentDelivery(d: DevelopmentDeliveryData): Finding {
  return developmentDeliveryTemplate({ id: "development-delivery", ...d });
}

function fromLargestProject(d: LargestProjectData): Finding {
  return largestProjectTemplate({ id: "largest-project", ...d });
}

function fromSupplementary(d: SupplementaryData): Finding {
  return supplementaryTemplate({ id: "supplementary", ...d });
}

function fromTopGrowthMinistry(d: TopGrowthMinistryData): Finding {
  return topGrowthMinistryTemplate({ id: "top-growth-ministry", ...d });
}

export const FINDINGS: FindingDef[] = [
  {
    id: "debt-service",
    async load(year) {
      const d = await getDebtServiceData(year);
      return d ? fromDebtService(d) : null;
    },
  },
  {
    id: "emolumen",
    async load(year) {
      const d = await getEmolumenData(year);
      return d ? fromEmolumen(d) : null;
    },
  },
  {
    id: "development-delivery",
    async load(year) {
      const d = await getDevelopmentDeliveryData(year);
      return d ? fromDevelopmentDelivery(d) : null;
    },
  },
  {
    id: "largest-project",
    async load(year) {
      const d = await getLargestProjectData(year);
      return d ? fromLargestProject(d) : null;
    },
  },
  {
    id: "supplementary",
    async load(year) {
      const d = await getSupplementaryData(year);
      return d ? fromSupplementary(d) : null;
    },
  },
  {
    id: "top-growth-ministry",
    async load(year) {
      const d = await getTopGrowthMinistryData(year);
      return d ? fromTopGrowthMinistry(d) : null;
    },
  },
];
