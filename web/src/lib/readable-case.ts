// MyProcurement prints titles, agencies and company names in capitals. readableCase gives them title case while
// keeping what must stay as printed: codes, references, acronyms and Roman numerals. Title case rather than sentence
// case, so the names of places, schools and companies inside a title keep their capitals.

const SMALL = new Set(
  "dan di ke bagi untuk serta atau kepada yang dari daripada dengan oleh pada and of the for to in on at by with".split(
    " ",
  ),
);

// Acronyms with a vowel in them, which the no-vowel rule below would otherwise miss.
const ACRONYMS = new Map(
  (
    "AADK APM APMM ASEAN ATM FAMA FELCRA FELDA IADA ICT IKBN IKM ILKBS ILP IPD IPG IPK IPTA JPA KTM LKIM LRT MAIWP " +
    "MARA MARDI MPOB MRT RISDA SIRIM SPA TUDM UIA UiTM UKM UM UMP UMS UNIMAS UPM UPSI USM UTHM UTM UUM"
  )
    .split(" ")
    .map((a) => [a.toLowerCase(), a]),
);

// Abbreviations without a vowel that are words, not acronyms: Sdn. Bhd., Jln., Kg., Sg. and so on.
const ABBREVIATIONS = new Set("sdn bhd jln kg kpg sg tmn bkt lrg bhg hj dr bt trdg mfg".split(" "));

const ROMAN = /^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/;

function word(part: string, first: boolean): string {
  const core = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!core) return part;
  const lower = core.toLowerCase();
  const at = part.indexOf(core);
  const swap = (to: string) => part.slice(0, at) + to + part.slice(at + core.length);
  const acronym = ACRONYMS.get(lower);
  if (acronym) return swap(acronym);
  if (/\p{N}/u.test(core) || ROMAN.test(lower)) return part; // KLR071, RMK12, FASA II
  if (/^(\p{L}\.)+$/u.test(part.replace(/[(),;:]/g, ""))) return part; // initials such as S.P.B.
  if (/^\(\p{L}{2,8}\)$/u.test(part)) return part; // an acronym in brackets, such as (HPUPM)
  if (!/[aeiouy]/.test(lower) && !ABBREVIATIONS.has(lower)) return part; // SMK, JKR, PDRM
  if (!first && SMALL.has(lower) && part === core) return lower;
  return swap(core.charAt(0) + lower.slice(1));
}

/** "MEMBEKAL UBAT KE HOSPITAL KUALA LUMPUR (JKR)" -> "Membekal Ubat ke Hospital Kuala Lumpur (JKR)". Text already in
 * mixed case is returned as it is. */
export function readableCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  let first = true;
  return text
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s*$/.test(token)) return token;
      if (token.includes("/") && /\p{N}/u.test(token)) return token; // references such as JKR/CKUB/17264/2013
      const out = token
        .split(/([/,-])/)
        .map((part) => (part === "/" || part === "," || part === "-" ? part : word(part, first)))
        .join("");
      first = false;
      return out;
    })
    .join("");
}
