import { ImageResponse } from "next/og";
import { linklyLogoDataUrl } from "./logo-data";

// iOS Safari's "Add to Home Screen" reads this specific convention (Next.js
// auto-emits <link rel="apple-touch-icon">) - it does NOT read
// manifest.json's icons array the way Android/desktop Chromium does, so
// without this file the installed icon falls back to a blank/generic tile.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#062725"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={linklyLogoDataUrl} alt="" width={143} height={79} />
      </div>
    ),
    size
  );
}
