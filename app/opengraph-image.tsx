import { ImageResponse } from "next/og";

export const alt = "AudienceW — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f1e8", color: "#241a14", padding: 72 }}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #decfbe", borderRadius: 42, padding: 60, background: "#fffdf9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 54, fontWeight: 800 }}>
          <div style={{ width: 86, height: 86, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 24, background: "#241a14", color: "#f7f1e8" }}>W</div>
          AudienceW
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 67, lineHeight: 1.15, fontWeight: 800 }}>One inbox. Every customer conversation.</div>
          <div style={{ fontSize: 30, color: "#8b563f" }}>Built for customer service and sales teams in Saudi Arabia</div>
        </div>
      </div>
    </div>,
    size
  );
}
