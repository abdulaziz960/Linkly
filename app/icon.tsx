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
          background: "#062725",
          border: "1px solid rgba(58, 189, 179, 0.55)"
        }}
      >
        <svg width="44" height="30" viewBox="0 0 120 70" fill="none">
          <defs>
            <linearGradient id="icon-mark" x1="10" y1="35" x2="110" y2="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#20aef0" />
              <stop offset="0.48" stopColor="#10c8c0" />
              <stop offset="1" stopColor="#08dfa8" />
            </linearGradient>
          </defs>
          <path d="M48 23C38 10 18 11 10 29C2 49 20 64 39 56C48 52 55 42 62 34L72 23C84 10 105 14 109 32C113 50 95 64 80 56C74 53 69 47 65 42" stroke="url(#icon-mark)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size
  );
}
