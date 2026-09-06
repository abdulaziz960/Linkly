import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { linklyLogoDataUrl } from "./logo-data";

export const alt = "Linkly — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #bcd8d3", borderRadius: 42, padding: 60, background: "#f6fbfa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 48, fontWeight: 900 }}>
            <div style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 26, background: "#123330" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={linklyLogoDataUrl} alt="" width={86} height={48} />
            </div>
            <div style={{ display: "flex" }}>Linkly</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, textAlign: "right", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 64, lineHeight: 1.25, fontWeight: 900 }}>صندوق واحد لكل محادثات عملائك</div>
            <div style={{ display: "flex", fontSize: 32, color: "#4c635f", fontWeight: 500 }}>
              واتساب وإنستغرام وتيليجرام والبريد في مكان واحد لفريقك
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: "#178a82" }}>linklysa.io</div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#4c635f" }}>منصة سعودية لخدمة العملاء</div>
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
