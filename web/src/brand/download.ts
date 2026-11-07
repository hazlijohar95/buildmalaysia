// Responses for the brand downloads: one file, or all of them zipped with a README.
import { strToU8, zipSync, type Zippable } from "fflate";
import { BRAND_FILES, mediaType, type BrandFile } from "./files";
import { BRAND_ZIP } from "./paths";
import { readme } from "./guide";
import { svgPng } from "./og";

export function fileResponse(file: BrandFile): Promise<Response> | Response {
  switch (file.format) {
    case "svg":
      return new Response(file.svg, { headers: { "content-type": mediaType(file) } });
    case "pdf":
      return new Response(file.pdf, { headers: { "content-type": mediaType(file) } });
    case "css":
    case "json":
      return new Response(file.text, { headers: { "content-type": mediaType(file) } });
    case "png":
      return svgPng(file.svg, file.width);
  }
}

/** PNGs are already compressed, so they are stored as they are. */
export async function zipResponse(): Promise<Response> {
  const folder = BRAND_ZIP.replace(/\.zip$/, "");
  const entries: Zippable = { [`${folder}/README.txt`]: strToU8(readme()) };
  for (const file of BRAND_FILES) {
    const bytes = new Uint8Array(await (await fileResponse(file)).arrayBuffer());
    entries[`${folder}/${file.name}`] = [bytes, { level: file.format === "png" ? 0 : 6 }];
  }
  return new Response(zipSync(entries), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${BRAND_ZIP}"` },
  });
}
