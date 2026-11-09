// The palette as files a designer or developer can drop in: CSS custom properties, and design tokens in the W3C
// Design Tokens format that Figma plugins such as Tokens Studio import.
import { biru } from "@/styles/colours/biru";
import { merah } from "@/styles/colours/merah";
import { REST, SERIES, TRACK } from "@/styles/charts/series";
import { PALETTE } from "./carta";
import { SECONDARY } from "./guide";

interface Token {
  name: string;
  hex: string;
  note: string;
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

const GROUPS: { group: string; tokens: Token[] }[] = [
  {
    group: "flag",
    tokens: Object.values(PALETTE).map((c) => ({
      name: key(c.name),
      hex: c.hex,
      note: `${c.role}. CMYK ${c.cmyk}${c.pantone ? `, Pantone ${c.pantone}` : ""}.`,
    })),
  },
  { group: "site", tokens: SECONDARY.map((c) => ({ name: key(c.name), hex: c.hex, note: `${c.role}.` })) },
  ...(
    [
      ["biru", biru, "800"],
      ["merah", merah, "600"],
    ] as const
  ).map(([name, scale, flag]) => ({
    group: name,
    tokens: Object.entries(scale).map(([step, hex]) => ({
      name: step,
      hex,
      note: step === flag ? "The flag's own." : "",
    })),
  })),
  {
    group: "chart",
    tokens: [
      ...SERIES.map((s, i) => ({ name: `series-${i + 1}`, hex: s.hex, note: s.token })),
      { name: "series-rest", hex: REST.hex, note: REST.token },
      { name: "track", hex: TRACK.hex, note: TRACK.token },
    ],
  },
];

const HEADER = "Build Malaysia colours. The full sheet: https://buildmalaysia.com/brand";

export function tokensCss(): string {
  const lines = GROUPS.flatMap(({ group, tokens }) => [
    "",
    ...tokens.map((t) => `  --bm-${group}-${t.name}: ${t.hex};${t.note ? ` /* ${t.note} */` : ""}`),
  ]);
  return `/* ${HEADER} */\n:root {${lines.join("\n")}\n}\n`;
}

export function tokensJson(): string {
  const tree = Object.fromEntries(
    GROUPS.map(({ group, tokens }) => [
      group,
      Object.fromEntries(
        tokens.map((t) => [t.name, { $type: "color", $value: t.hex, ...(t.note ? { $description: t.note } : {}) }]),
      ),
    ]),
  );
  return JSON.stringify({ $description: HEADER, colour: tree }, null, 2) + "\n";
}
