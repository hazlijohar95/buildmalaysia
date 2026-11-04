// Plain-English definitions of the terms the statements and budget books use. The methodology page renders
// them; data pages link a term's first use to /methodology#<id>.

export interface GlossaryTerm {
  id: string;
  term: string;
  ms: string; // the term as the documents print it
  body: string;
}

export const GLOSSARY = [
  {
    id: "vote",
    term: "Vote",
    ms: "Maksud",
    body: "The unit in which Parliament approves spending, usually one per ministry or department. The statements and the budget books list spending vote by vote, each with a code.",
  },
  {
    id: "vote-codes",
    term: "B., P. and T. codes",
    ms: "Bekalan, Pembangunan, Tanggungan",
    body: "B is a supply vote (Bekalan): operating spending Parliament votes each year. P is a development vote (Pembangunan): spending on projects. T is charged expenditure (Tanggungan): spending charged on the Consolidated Fund by law, such as debt service, pensions and judges' pay, which is not voted each year. A ministry's supply and development votes share a number: B.63 and P.63 are the Ministry of Education. P.70 is the contingency reserve the budget books print as Simpanan Luar Jangka.",
  },
  {
    id: "operating-development",
    term: "Operating and development",
    ms: "Mengurus, Pembangunan",
    body: "Operating expenditure runs the government: salaries, supplies and services, grants, debt interest and pensions (B and T votes). Development expenditure builds and upgrades things, project by project, under a five-year Malaysia Plan (P votes).",
  },
  {
    id: "original-revised",
    term: "Original and revised budget",
    ms: "Asal, Jumlah / Anggaran Dipinda",
    body: "The original budget (Asal) is what Parliament approved before the year began. During the year supplementary allocations (Tambahan) and money moved between lines (Viremen) change it; the result is the revised budget, which the statements print as Jumlah and the budget books as Anggaran Dipinda. % used (Prestasi) compares what was spent (Sebenar) with the revised budget, and unspent (Varian) is the revised budget less what was spent.",
  },
  {
    id: "programme-activity",
    term: "Programmes and activities",
    ms: "Program, Aktiviti",
    body: "Each operating vote is split into programmes, and each programme into activities, each with a six-digit code. The statements report spending at every level and print a total for each.",
  },
  {
    id: "objects",
    term: "Spending categories",
    ms: "Objek",
    body: "Within each activity, spending is split by what the money paid for: emoluments (Emolumen, 10000), supplies and services (Perkhidmatan dan Bekalan, 20000), assets (Aset, 30000), grants and fixed charges (Pemberian dan Kenaan Bayaran Tetap, 40000) and other expenditure (Perbelanjaan-perbelanjaan Lain, 50000).",
  },
  {
    id: "rmke-12",
    term: "RMKe-12",
    ms: "Rancangan Malaysia Kedua Belas",
    body: "The Twelfth Malaysia Plan, 2021–2025: the five-year plan development projects were approved under. The development statements report each project's spending under the current plan to date (RMKe-11, the Eleventh Plan, covers 2016–2020).",
  },
  {
    id: "posts",
    term: "Posts",
    ms: "Bil. Jawatan",
    body: "The number of established positions the budget book prints for an activity, against its emoluments.",
  },
] as const satisfies readonly GlossaryTerm[];

export type TermId = (typeof GLOSSARY)[number]["id"];
