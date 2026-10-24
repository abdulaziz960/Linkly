import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { linklyLogoDataUrl } from "./logo-data";

export const alt = "Linkly — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** One Arabic line, one element per word, the first word at the right. */
function RtlLine({ text, size, color, weight }: { text: string; size: number; color?: string; weight?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse", gap: Math.round(size * 0.28), fontSize: size, ...(color ? { color } : {}), ...(weight ? { fontWeight: weight } : {}) }}>
      {text.split(" ").map((word, index) => (
        <div key={`${index}-${word}`} style={{ display: "flex" }}>{word}</div>
      ))}
    </div>
  );
}

export default async function OpenGraphImage() {
  // Satori (the renderer behind ImageResponse) only understands TTF/OTF/WOFF,
  // not WOFF2 - the site's own thmanyahsans files are WOFF2-only, so this
  // route keeps its own TTF copy of an Arabic-capable font instead.
  const [regular, black] = await Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Medium.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/tajawal/Tajawal-Black.ttf"))
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eaf3f1", color: "#101b18", padding: 72, fontFamily: "Tajawal" }}>
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #bcd8d3", borderRadius: 42, padding: 48, background: "#f6fbfa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 48, fontWeight: 900 }}>
            <div style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 26, background: "#123330" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={linklyLogoDataUrl} alt="" width={86} height={48} />
            </div>
            <div style={{ display: "flex" }}>Linkly</div>
          </div>
          {/* Satori has no real bidi support: a string of Arabic words is laid out left to right, so the words come out in
              reverse order (the letters inside each word are shaped correctly). Every line is therefore built from one
              element per word, placed with row-reverse so the first word sits at the right - the order does not depend on
              the renderer's text direction at all. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 54, lineHeight: 1.2, fontWeight: 900 }}>
              <RtlLine text="أدر واتساب وكل قنوات عملائك" size={54} weight={900} />
              <RtlLine text="من صندوق واحد" size={54} weight={900} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 28, color: "#4c635f", fontWeight: 500, gap: 6 }}>
              <RtlLine text="ردود آلية وكتالوج للطلب من واتساب" size={28} color="#4c635f" weight={500} />
              <RtlLine text="وحملات تسويقية بمنصة سعودية" size={28} color="#4c635f" weight={500} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: "#178a82" }}>linklysa.io</div>
            <RtlLine text="ابدأ تجربتك المجانية" size={26} color="#4c635f" weight={500} />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Tajawal", data: regular, weight: 500, style: "normal" },
        { name: "Tajawal", data: black, weight: 900, style: "normal" }
      ]
    }
  );
}
