import { ImageResponse } from "next/og";
import { svgDataUri } from "@/brand/carta";
import { BRAND_FILES } from "@/brand/files";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = BRAND_FILES.find((f) => f.name === name);
  if (!file) return new Response("Not found", { status: 404 });
  if (file.format === "svg") {
    return new Response(file.svg, { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
  }
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img>, not next/image */}
        <img src={svgDataUri(file.svg)} width={file.width} height={file.height} alt="" />
      </div>
    ),
    { width: file.width, height: file.height },
  );
}
