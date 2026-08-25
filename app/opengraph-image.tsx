import { ImageResponse } from "next/og";

export const alt = "Linkly — صندوق موحد لمحادثات العملاء";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eaf3f1", color: "#101b18", padding: 72 }}>
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #bcd8d3", borderRadius: 42, padding: 60, background: "#f6fbfa" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 54, fontWeight: 800 }}>
          <div style={{ width: 86, height: 86, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 24, background: "#178a82", color: "#fff" }}>L</div>
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
