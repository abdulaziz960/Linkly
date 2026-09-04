import { ImageResponse } from "next/og";
import { linklyLogoDataUrl } from "./logo-data";

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
          background: "#062725",
          border: "1px solid rgba(43, 176, 242, 0.55)"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={linklyLogoDataUrl} alt="" width={38} height={21} />
      </div>
    ),
    size
  );
}
