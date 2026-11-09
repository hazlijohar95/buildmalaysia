// The colours a breakdown of spending gives its parts, in the order it hands them out: the largest first. The tax
// calculator, the ministry pages and the brand sheet all read this list. Families are imported one by one so the
// tax calculator's client bundle carries only these.
import { aurora } from "@/styles/colours/aurora";
import { biru } from "@/styles/colours/biru";
import { charcoal } from "@/styles/colours/charcoal";
import { copper } from "@/styles/colours/copper";
import { lake } from "@/styles/colours/lake";
import { linen } from "@/styles/colours/linen";
import { merah } from "@/styles/colours/merah";
import { pine } from "@/styles/colours/pine";

/** Each at least 4:1 against the linen-200 bar track. */
export const SERIES = [
  { token: "merah-600", hex: merah["600"] },
  { token: "lake-700", hex: lake["700"] },
  { token: "pine-700", hex: pine["700"] },
  { token: "aurora-700", hex: aurora["700"] },
  { token: "biru-600", hex: biru["600"] },
  { token: "copper-700", hex: copper["700"] },
  { token: "charcoal-700", hex: charcoal["700"] },
] as const;

/** Everything past the last series, gathered into one. */
export const REST = { token: "charcoal-300", hex: charcoal["300"] } as const;

/** The empty part of a bar. */
export const TRACK = { token: "linen-200", hex: linen["200"] } as const;
