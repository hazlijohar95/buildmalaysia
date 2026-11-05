// Registry of downloadable datasets. Each dataset maps one fiscal or budget year to a table of rows.
// Queries use scalar year parameters throughout — never JS arrays — to satisfy the Workers postgres
// constraint (fetch_types:false serialises arrays as "a,b" instead of a proper array literal).
import sql from "@/lib/db";
import { senToRm } from "@/lib/csv";

export type Row = Record<string, string | number | null>;

export interface Dataset {
  id: string;
  title: string;
  description: string;
  /** One-line explanation per column, keyed by column name. */
  columnDescriptions: Readonly<Record<string, string>>;
  /** Available years for this dataset, newest first. */
  years(): Promise<number[]>;
  /** Column names in CSV order. */
  columns: readonly string[];
  /** All rows for the given year. */
  rows(year: number): Promise<Row[]>;
}

function rm(raw: string | null): string | null {
  return senToRm(raw);
}

// ── 1. Operating expenditure leaf lines ───────────────────────────────────────

const operatingLines: Dataset = {
  id: "operating-lines",
  title: "Operating expenditure lines",
  description:
    "Every leaf fact from Lampiran 1 (Penyata Perbelanjaan Mengurus), one row per vote × activity × object group. Covers FY2016–FY2025.",
  columnDescriptions: {
    vote_code: "Vote code: T.xx (Tanggungan / charged) or B.xx (Bekalan / supply)",
    vote_name_ms: "Ministry or agency name as printed in the statement",
    programme_code: "Programme code (six digits, last four zero)",
    programme_name_ms: "Programme name as printed; null where the statement prints no heading",
    activity_code: "Activity code",
    activity_name_ms: "Activity name as printed",
    object_code: "Object group code (1–5 followed by four zeros)",
    object_name_ms: "Object group: Emolumen, Perkhidmatan dan Bekalan, Aset, Pemberian, Lain-lain",
    asal_rm: "Anggaran Asal (original estimate), ringgit",
    tambahan_rm:
      "Tambahan/(Kurangan) (supplementary / reduction), ringgit; null for FY2016–2019 (four-column statements)",
    viremen_rm: "Viremen (virement), ringgit; null for FY2016–2019",
    jumlah_rm: "Jumlah (revised total = Asal + Tambahan + Viremen), ringgit",
    sebenar_rm: "Perbelanjaan Sebenar (actual spending), ringgit",
    pdf_page: "PDF page number in the source document",
    book_page: "Printed page number in the source document",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "vote_code",
    "vote_name_ms",
    "programme_code",
    "programme_name_ms",
    "activity_code",
    "activity_name_ms",
    "object_code",
    "object_name_ms",
    "asal_rm",
    "tambahan_rm",
    "viremen_rm",
    "jumlah_rm",
    "sebenar_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ fiscal_year: number }[]>`
      select distinct fiscal_year from operating_line order by fiscal_year desc
    `;
    return rows.map((r) => r.fiscal_year);
  },
  async rows(year) {
    const data = await sql<
      {
        vote_code: string;
        vote_name_ms: string;
        programme_code: string;
        programme_name_ms: string | null;
        activity_code: string;
        activity_name_ms: string;
        object_code: string;
        object_name_ms: string;
        original_sen: string;
        supplementary_sen: string | null;
        virement_sen: string | null;
        revised_sen: string;
        actual_sen: string;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        d.vote_code, d.vote_name_ms, d.programme_code, d.programme_name_ms,
        d.activity_code, d.activity_name_ms, d.object_code,
        og.name_ms as object_name_ms,
        d.original_sen, d.supplementary_sen, d.virement_sen, d.revised_sen, d.actual_sen,
        d.pdf_page, d.book_page, sd.url as doc_url, d.source_text
      from operating_line_detail d
      join object_group og on og.code = d.object_code
      join source_document sd on sd.id = d.document_id
      where d.fiscal_year = ${year}
      order by d.vote_code, d.activity_code, d.object_code
    `;
    return data.map((r) => ({
      vote_code: r.vote_code,
      vote_name_ms: r.vote_name_ms,
      programme_code: r.programme_code,
      programme_name_ms: r.programme_name_ms,
      activity_code: r.activity_code,
      activity_name_ms: r.activity_name_ms,
      object_code: r.object_code,
      object_name_ms: r.object_name_ms,
      asal_rm: rm(r.original_sen),
      tambahan_rm: rm(r.supplementary_sen),
      viremen_rm: rm(r.virement_sen),
      jumlah_rm: rm(r.revised_sen),
      sebenar_rm: rm(r.actual_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 2. Development expenditure projects ───────────────────────────────────────

const developmentProjects: Dataset = {
  id: "development-projects",
  title: "Development expenditure projects",
  description:
    "Every project from Lampiran 2 (Penyata Perbelanjaan Pembangunan), one row per project. Covers FY2016–FY2025.",
  columnDescriptions: {
    vote_code: "Development vote code (P.xx)",
    vote_name_ms: "Ministry or agency name as printed",
    group_name_ms: "Agency group heading under the vote; null where no group is printed",
    project_code: "Five-digit project code",
    project_name_ms: "Project name as printed",
    kos_keseluruhan_rm: "Kos Keseluruhan (total project cost), ringgit",
    anggaran_cara_langsung_rm: "Anggaran Cara Langsung (direct estimate for the year), ringgit",
    anggaran_pinjaman_rm: "Anggaran Pinjaman (loan-funded estimate for the year), ringgit",
    anggaran_rm: "Anggaran Jumlah (total estimate = direct + loan), ringgit",
    sebenar_cara_langsung_rm: "Perbelanjaan Sebenar Cara Langsung (direct actual), ringgit",
    sebenar_pinjaman_rm: "Perbelanjaan Sebenar Pinjaman (loan-funded actual), ringgit",
    sebenar_rm: "Perbelanjaan Sebenar Jumlah (total actual = direct + loan), ringgit",
    plan_terdahulu_rm: "RMKe-12 spending to end of the prior year, ringgit",
    plan_terkumpul_rm: "RMKe-12 spending to end of this year (= prior + actual), ringgit",
    pdf_page: "PDF page number of the label page (amounts are on pdf_page + 1)",
    book_page: "Printed page number of the label page",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "vote_code",
    "vote_name_ms",
    "group_name_ms",
    "project_code",
    "project_name_ms",
    "kos_keseluruhan_rm",
    "anggaran_cara_langsung_rm",
    "anggaran_pinjaman_rm",
    "anggaran_rm",
    "sebenar_cara_langsung_rm",
    "sebenar_pinjaman_rm",
    "sebenar_rm",
    "plan_terdahulu_rm",
    "plan_terkumpul_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ fiscal_year: number }[]>`
      select distinct fiscal_year from development_project order by fiscal_year desc
    `;
    return rows.map((r) => r.fiscal_year);
  },
  async rows(year) {
    const data = await sql<
      {
        vote_code: string;
        vote_name_ms: string;
        group_name_ms: string | null;
        project_code: string;
        project_name_ms: string;
        total_cost_sen: string;
        estimate_direct_sen: string;
        estimate_loan_sen: string;
        estimate_sen: string;
        actual_direct_sen: string;
        actual_loan_sen: string;
        actual_sen: string;
        plan_actual_prior_sen: string;
        plan_actual_to_date_sen: string;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        p.vote_code, v.name_ms as vote_name_ms,
        g.name_ms as group_name_ms,
        p.code as project_code, p.name_ms as project_name_ms,
        p.total_cost_sen, p.estimate_direct_sen, p.estimate_loan_sen, p.estimate_sen,
        p.actual_direct_sen, p.actual_loan_sen, p.actual_sen,
        p.plan_actual_prior_sen, p.plan_actual_to_date_sen,
        p.pdf_page, p.book_page, sd.url as doc_url, p.source_text
      from development_project p
      join development_vote v on v.fiscal_year = p.fiscal_year and v.code = p.vote_code
      left join development_group g
        on g.fiscal_year = p.fiscal_year and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
      join source_document sd on sd.id = p.document_id
      where p.fiscal_year = ${year}
      order by p.vote_code, p.pdf_page, p.line_no
    `;
    return data.map((r) => ({
      vote_code: r.vote_code,
      vote_name_ms: r.vote_name_ms,
      group_name_ms: r.group_name_ms,
      project_code: r.project_code,
      project_name_ms: r.project_name_ms,
      kos_keseluruhan_rm: rm(r.total_cost_sen),
      anggaran_cara_langsung_rm: rm(r.estimate_direct_sen),
      anggaran_pinjaman_rm: rm(r.estimate_loan_sen),
      anggaran_rm: rm(r.estimate_sen),
      sebenar_cara_langsung_rm: rm(r.actual_direct_sen),
      sebenar_pinjaman_rm: rm(r.actual_loan_sen),
      sebenar_rm: rm(r.actual_sen),
      plan_terdahulu_rm: rm(r.plan_actual_prior_sen),
      plan_terkumpul_rm: rm(r.plan_actual_to_date_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 3. Federal revenue lines ───────────────────────────────────────────────────

const revenueLines: Dataset = {
  id: "revenue-lines",
  title: "Federal revenue lines",
  description:
    "Individual items from Note 5(a) (Hasil mengikut penjenisan) of the financial statement. Covers FY2016–FY2025.",
  columnDescriptions: {
    category:
      "Revenue category: direct_tax, indirect_tax, non_tax, non_revenue_receipts, federal_territory, or tax (older years)",
    name_ms: "Item name as printed",
    anggaran_asal_rm: "Anggaran Asal (original estimate), ringgit",
    anggaran_disemak_rm: "Anggaran Disemak (revised estimate), ringgit",
    sebenar_rm: "Sebenar (actual revenue), ringgit",
    sebenar_tahun_lalu_rm: "Sebenar of the prior year as printed in this statement, ringgit",
    pdf_page: "PDF page number in the source document",
    book_page: "Printed page number in the source document",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "category",
    "name_ms",
    "anggaran_asal_rm",
    "anggaran_disemak_rm",
    "sebenar_rm",
    "sebenar_tahun_lalu_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ fiscal_year: number }[]>`
      select distinct fiscal_year from revenue_line order by fiscal_year desc
    `;
    return rows.map((r) => r.fiscal_year);
  },
  async rows(year) {
    const data = await sql<
      {
        category: string;
        name_ms: string;
        original_estimate_sen: string;
        revised_estimate_sen: string;
        actual_sen: string;
        prior_year_actual_sen: string;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        l.category::text as category, l.name_ms,
        l.original_estimate_sen, l.revised_estimate_sen,
        l.actual_sen, l.prior_year_actual_sen,
        l.pdf_page, l.book_page, sd.url as doc_url, l.source_text
      from revenue_line l
      join source_document sd on sd.id = l.document_id
      where l.fiscal_year = ${year}
      order by l.ordinal
    `;
    return data.map((r) => ({
      category: r.category,
      name_ms: r.name_ms,
      anggaran_asal_rm: rm(r.original_estimate_sen),
      anggaran_disemak_rm: rm(r.revised_estimate_sen),
      sebenar_rm: rm(r.actual_sen),
      sebenar_tahun_lalu_rm: rm(r.prior_year_actual_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 4. COVID-19 Fund lines ─────────────────────────────────────────────────────

const covidFund: Dataset = {
  id: "covid-fund",
  title: "COVID-19 Fund lines",
  description: "Programme lines from Lampiran 3 (Penyata Perbelanjaan Kumpulan Wang COVID-19), FY2020–FY2023.",
  columnDescriptions: {
    code: "Five-digit programme code",
    name_ms: "Programme name as printed",
    siling_rm: "Siling Keseluruhan (overall ceiling), ringgit",
    peruntukan_rm: "Peruntukan (allocation for the year), ringgit",
    tambahan_rm: "Tambahan (supplementary; printed only in FY2021, zero otherwise), ringgit",
    viremen_rm: "Viremen Tambah/(Kurang) (virement), ringgit",
    peruntukan_dipinda_rm: "Peruntukan Dipinda (revised = allocation + supplementary + virement), ringgit",
    sebenar_rm: "Perbelanjaan Sebenar (actual spending), ringgit",
    belanja_terdahulu_rm: "Perbelanjaan to end of the prior year, ringgit",
    belanja_terkumpul_rm: "Perbelanjaan Terkumpul to end of this year (= prior + actual), ringgit",
    pdf_page: "PDF page number of the label page (amounts are on pdf_page + 1)",
    book_page: "Printed page number of the label page",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "code",
    "name_ms",
    "siling_rm",
    "peruntukan_rm",
    "tambahan_rm",
    "viremen_rm",
    "peruntukan_dipinda_rm",
    "sebenar_rm",
    "belanja_terdahulu_rm",
    "belanja_terkumpul_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ fiscal_year: number }[]>`
      select fiscal_year from covid_fund_total order by fiscal_year desc
    `;
    return rows.map((r) => r.fiscal_year);
  },
  async rows(year) {
    const data = await sql<
      {
        code: string;
        name_ms: string;
        ceiling_sen: string;
        allocation_sen: string;
        supplementary_sen: string;
        virement_sen: string;
        revised_sen: string;
        actual_sen: string;
        spent_prior_sen: string;
        spent_to_date_sen: string;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        l.code, l.name_ms,
        l.ceiling_sen, l.allocation_sen, l.supplementary_sen, l.virement_sen,
        l.revised_sen, l.actual_sen, l.spent_prior_sen, l.spent_to_date_sen,
        l.pdf_page, l.book_page, sd.url as doc_url, l.source_text
      from covid_fund_line l
      join source_document sd on sd.id = l.document_id
      where l.fiscal_year = ${year}
      order by l.line_no
    `;
    return data.map((r) => ({
      code: r.code,
      name_ms: r.name_ms,
      siling_rm: rm(r.ceiling_sen),
      peruntukan_rm: rm(r.allocation_sen),
      tambahan_rm: rm(r.supplementary_sen),
      viremen_rm: rm(r.virement_sen),
      peruntukan_dipinda_rm: rm(r.revised_sen),
      sebenar_rm: rm(r.actual_sen),
      belanja_terdahulu_rm: rm(r.spent_prior_sen),
      belanja_terkumpul_rm: rm(r.spent_to_date_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 5. Budget operating lines ──────────────────────────────────────────────────

const budgetOperatingLines: Dataset = {
  id: "budget-operating-lines",
  title: "Budget operating lines",
  description:
    "Operating estimates per activity × object group from the MOF budget book (Anggaran Perbelanjaan Persekutuan). Year is the budget year (the year being estimated).",
  columnDescriptions: {
    vote_code: "Vote code (T.xx or B.xx)",
    programme_code: "Programme code",
    activity_code: "Activity code",
    object_code: "Object group code",
    object_name_ms: "Object group name",
    anggaran_semasa_rm: "Prior estimate (the current year's original estimate printed in this book), ringgit",
    anggaran_rm: "Estimate for the budget year, ringgit",
    jawatan_semasa: "Established posts for the current year; null where the book prints none",
    jawatan: "Established posts for the budget year; null where the book prints none",
    pdf_page: "PDF page number in the source document",
    book_page: "Printed page number in the source document",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "vote_code",
    "programme_code",
    "activity_code",
    "object_code",
    "object_name_ms",
    "anggaran_semasa_rm",
    "anggaran_rm",
    "jawatan_semasa",
    "jawatan",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ budget_year: number }[]>`
      select budget_year from budget_document order by budget_year desc
    `;
    return rows.map((r) => r.budget_year);
  },
  async rows(year) {
    const data = await sql<
      {
        vote_code: string;
        programme_code: string;
        activity_code: string;
        object_code: string;
        object_name_ms: string;
        prior_estimate_sen: string;
        estimate_sen: string;
        prior_posts: number | null;
        posts: number | null;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        l.vote_code, l.programme_code, l.activity_code, l.object_code,
        og.name_ms as object_name_ms,
        l.prior_estimate_sen, l.estimate_sen,
        l.prior_posts, l.posts,
        l.pdf_page, l.book_page, sd.url as doc_url, l.source_text
      from budget_operating_line l
      join budget_document d on d.document_id = l.document_id
      join object_group og on og.code = l.object_code
      join source_document sd on sd.id = l.document_id
      where d.budget_year = ${year}
      order by l.vote_code, l.activity_code, l.object_code
    `;
    return data.map((r) => ({
      vote_code: r.vote_code,
      programme_code: r.programme_code,
      activity_code: r.activity_code,
      object_code: r.object_code,
      object_name_ms: r.object_name_ms,
      anggaran_semasa_rm: rm(r.prior_estimate_sen),
      anggaran_rm: rm(r.estimate_sen),
      jawatan_semasa: r.prior_posts,
      jawatan: r.posts,
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 6. Budget development projects ────────────────────────────────────────────

const budgetDevelopmentProjects: Dataset = {
  id: "budget-development-projects",
  title: "Budget development projects",
  description: "Development project estimates from the MOF budget book (P votes). Year is the budget year.",
  columnDescriptions: {
    vote_code: "Development vote code (P.xx)",
    group_name_ms: "Agency group heading under the vote; null where no group is printed",
    project_code: "Five-digit project code",
    project_name_ms: "Project name as printed",
    kos_keseluruhan_rm: "Total project cost, ringgit",
    sebenar_terdahulu_rm: "Actual spending two years before the budget year (as printed in this book), ringgit",
    anggaran_dipinda_rm: "Revised estimate for the current year, ringgit",
    anggaran_cara_langsung_rm: "Direct estimate for the budget year, ringgit",
    anggaran_pinjaman_rm: "Loan-funded estimate for the budget year, ringgit",
    pdf_page: "PDF page number in the source document",
    book_page: "Printed page number in the source document",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "vote_code",
    "group_name_ms",
    "project_code",
    "project_name_ms",
    "kos_keseluruhan_rm",
    "sebenar_terdahulu_rm",
    "anggaran_dipinda_rm",
    "anggaran_cara_langsung_rm",
    "anggaran_pinjaman_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ budget_year: number }[]>`
      select budget_year from budget_document order by budget_year desc
    `;
    return rows.map((r) => r.budget_year);
  },
  async rows(year) {
    const data = await sql<
      {
        vote_code: string;
        group_name_ms: string | null;
        project_code: string;
        project_name_ms: string;
        total_cost_sen: string;
        actual_prior_sen: string;
        revised_sen: string;
        estimate_direct_sen: string;
        estimate_loan_sen: string;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        p.vote_code, g.name_ms as group_name_ms,
        p.code as project_code, p.name_ms as project_name_ms,
        p.total_cost_sen, p.actual_prior_sen, p.revised_sen,
        p.estimate_direct_sen, p.estimate_loan_sen,
        p.pdf_page, p.book_page, sd.url as doc_url, p.source_text
      from budget_development_project p
      join budget_document d on d.document_id = p.document_id
      left join budget_development_group g
        on g.document_id = p.document_id and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
      join source_document sd on sd.id = p.document_id
      where d.budget_year = ${year}
      order by p.vote_code, p.pdf_page, p.line_no
    `;
    return data.map((r) => ({
      vote_code: r.vote_code,
      group_name_ms: r.group_name_ms,
      project_code: r.project_code,
      project_name_ms: r.project_name_ms,
      kos_keseluruhan_rm: rm(r.total_cost_sen),
      sebenar_terdahulu_rm: rm(r.actual_prior_sen),
      anggaran_dipinda_rm: rm(r.revised_sen),
      anggaran_cara_langsung_rm: rm(r.estimate_direct_sen),
      anggaran_pinjaman_rm: rm(r.estimate_loan_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── 7. Budget vote figures ─────────────────────────────────────────────────────

const budgetVoteFigures: Dataset = {
  id: "budget-vote-figures",
  title: "Budget vote figures",
  description:
    "Per-vote summary from the budget book's Ringkasan Perbelanjaan pages. Each budget year covers four fiscal years (two actuals, one original estimate, one estimate). Year is the budget year.",
  columnDescriptions: {
    vote_code: "Vote code (T.xx, B.xx, or P.xx)",
    heading: "Ministry or agency heading printed above the vote",
    fiscal_year: "The fiscal year this row covers (e.g. 2025 for a 2027 budget book)",
    basis: "actual, original_estimate, or estimate",
    jumlah_rm: "Total amount for the vote and fiscal year, ringgit",
    emolumen_rm: "Emoluments (T and B votes only), ringgit; null for P votes",
    lain_lain_rm: "Other spending (T and B votes only), ringgit; null for P votes",
    cara_langsung_rm: "Direct spending (P votes only), ringgit; null for T and B votes",
    pinjaman_rm: "Loan-funded spending (P votes only), ringgit; null for T and B votes and P.70",
    pdf_page: "PDF page number in the source document",
    book_page: "Printed page number in the source document",
    doc_url: "URL of the source PDF",
    source_text: "Raw text line extracted from the PDF",
  },
  columns: [
    "vote_code",
    "heading",
    "fiscal_year",
    "basis",
    "jumlah_rm",
    "emolumen_rm",
    "lain_lain_rm",
    "cara_langsung_rm",
    "pinjaman_rm",
    "pdf_page",
    "book_page",
    "doc_url",
    "source_text",
  ],
  async years() {
    const rows = await sql<{ budget_year: number }[]>`
      select budget_year from budget_document order by budget_year desc
    `;
    return rows.map((r) => r.budget_year);
  },
  async rows(year) {
    const data = await sql<
      {
        vote_code: string;
        heading: string;
        fiscal_year: number;
        basis: string;
        total_sen: string;
        emoluments_sen: string | null;
        other_sen: string | null;
        direct_sen: string | null;
        loan_sen: string | null;
        pdf_page: number;
        book_page: number;
        doc_url: string;
        source_text: string;
      }[]
    >`
      select
        f.vote_code, f.heading, f.fiscal_year, f.basis::text as basis,
        f.total_sen, f.emoluments_sen, f.other_sen, f.direct_sen, f.loan_sen,
        f.pdf_page, f.book_page, sd.url as doc_url, f.source_text
      from budget_vote_figure f
      join budget_document d on d.document_id = f.document_id
      join source_document sd on sd.id = f.document_id
      where d.budget_year = ${year}
      order by f.fiscal_year, left(f.vote_code, 1) desc, f.vote_code
    `;
    return data.map((r) => ({
      vote_code: r.vote_code,
      heading: r.heading,
      fiscal_year: r.fiscal_year,
      basis: r.basis,
      jumlah_rm: rm(r.total_sen),
      emolumen_rm: rm(r.emoluments_sen),
      lain_lain_rm: rm(r.other_sen),
      cara_langsung_rm: rm(r.direct_sen),
      pinjaman_rm: rm(r.loan_sen),
      pdf_page: r.pdf_page,
      book_page: r.book_page,
      doc_url: r.doc_url,
      source_text: r.source_text,
    }));
  },
};

// ── Registry ───────────────────────────────────────────────────────────────────

const ALL: Dataset[] = [
  operatingLines,
  developmentProjects,
  revenueLines,
  covidFund,
  budgetOperatingLines,
  budgetDevelopmentProjects,
  budgetVoteFigures,
];

/** Map from dataset id to its descriptor. O(1) lookup. */
export const DATASETS: ReadonlyMap<string, Dataset> = new Map(ALL.map((d) => [d.id, d]));
