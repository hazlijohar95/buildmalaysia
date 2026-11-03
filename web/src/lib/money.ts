declare const __sen__: unique symbol;

/** Integer sen. Parsed from the database bigint-as-string at the query boundary. */
export type Sen = number & { [__sen__]: true };

/** Parse a postgres bigint column (returned as string) into Sen. */
export function parseSen(raw: string | number | bigint): Sen {
  if (typeof raw === "bigint") return Number(raw) as Sen;
  if (typeof raw === "number") return raw as Sen;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new RangeError(`Cannot parse Sen from ${JSON.stringify(raw)}`);
  return n as Sen;
}

/** Full RM with two decimal places, e.g. "RM 13,532,772.40". */
export function formatSen(sen: Sen): string {
  const rm = sen / 100;
  const sign = rm < 0 ? "-" : "";
  const abs = Math.abs(rm);
  const formatted = abs.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}RM ${formatted}`;
}

/** Compact form for headlines, e.g. "RM 120.00 mil" or "RM 1.14 bil". */
export function formatSenCompact(sen: Sen): string {
  const rm = sen / 100;
  const sign = rm < 0 ? "-" : "";
  const abs = Math.abs(rm);

  if (abs >= 1_000_000_000) {
    const val = (abs / 1_000_000_000).toFixed(2);
    return `${sign}RM ${val} bil`;
  }
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(2);
    return `${sign}RM ${val} juta`;
  }
  return formatSen(sen);
}

/** Percentage utilised from revised and actual, rounded to two decimal places. */
export function utilisation(revised: Sen, actual: Sen): number {
  if (revised === 0) return 0;
  return Math.round((actual / revised) * 10000) / 100;
}
