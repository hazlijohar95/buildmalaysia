// RFC 4180 CSV utilities.

type Cell = string | number | null | undefined;

/**
 * Exact ringgit as a decimal string from an integer-sen postgres bigint column.
 * With fetch_types:false, bigint columns arrive as strings; null stays null.
 * Uses BigInt arithmetic — no floating-point division — so the result is exact for any amount.
 */
export function senToRm(raw: string | null): string | null {
  if (raw === null) return null;
  const n = BigInt(raw);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const rm = abs / 100n;
  const cents = abs % 100n;
  return `${neg ? "-" : ""}${rm}.${String(cents).padStart(2, "0")}`;
}

function quoteCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180 §2.6: quote a field that contains a comma, double-quote, or line break.
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/** Build a RFC 4180 CSV string. Prepends UTF-8 BOM so Excel opens it without a wizard. */
export function buildCsv(columns: readonly string[], rows: Record<string, Cell>[]): string {
  const header = columns.map(quoteCell).join(",");
  const body = rows.map((row) => columns.map((col) => quoteCell(row[col])).join(",")).join("\r\n");
  return "﻿" + header + "\r\n" + (body ? body + "\r\n" : "");
}
