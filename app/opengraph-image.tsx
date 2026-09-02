import { ImageResponse } from "next/og";

export const alt = "Linkly — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eaf3f1", color: "#101b18", padding: 72 }}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #bcd8d3", borderRadius: 42, padding: 60, background: "#f6fbfa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 54, fontWeight: 800 }}>
          <div style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 26, background: "#123330" }}>
            <svg width="86" height="52" viewBox="0 0 120 70" fill="none">
              <defs>
                <linearGradient id="og-mark" x1="10" y1="35" x2="110" y2="35" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#20aef0" />
                  <stop offset="0.48" stopColor="#10c8c0" />
                  <stop offset="1" stopColor="#08dfa8" />
                </linearGradient>
              </defs>
              <path d="M48 23C38 10 18 11 10 29C2 49 20 64 39 56C48 52 55 42 62 34L72 23C84 10 105 14 109 32C113 50 95 64 80 56C74 53 69 47 65 42" stroke="url(#og-mark)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          Linkly
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 67, lineHeight: 1.15, fontWeight: 800 }}>One inbox. Every customer conversation.</div>
          <div style={{ fontSize: 30, color: "#4c635f" }}>Built for customer service and sales teams in Saudi Arabia</div>
        </div>
      </div>
    </div>,
    size
  );
}
