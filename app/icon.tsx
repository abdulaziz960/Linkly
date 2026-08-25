import { ImageResponse } from "next/og";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 13,
          background: "#178a82",
          color: "#fff",
          fontSize: 28,
          fontWeight: 800
        }}
      >
        L
      </div>
    ),
    size
  );
}
