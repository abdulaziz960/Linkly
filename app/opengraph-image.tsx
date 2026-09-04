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
                <linearGradient id="og-left" x1="16" y1="15" x2="56" y2="55" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3abdb3" />
                  <stop offset="1" stopColor="#178a82" />
                </linearGradient>
                <linearGradient id="og-right" x1="64" y1="15" x2="104" y2="55" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#178a82" />
                  <stop offset="1" stopColor="#0f5f5a" />
                </linearGradient>
              </defs>
              <circle cx="36" cy="35" r="15" stroke="url(#og-left)" strokeWidth="10" />
              <circle cx="84" cy="35" r="15" stroke="url(#og-right)" strokeWidth="10" />
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
