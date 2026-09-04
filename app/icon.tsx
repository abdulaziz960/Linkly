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
            <linearGradient id="icon-left" x1="16" y1="15" x2="56" y2="55" gradientUnits="userSpaceOnUse">
              <stop stopColor="#3abdb3" />
              <stop offset="1" stopColor="#178a82" />
            </linearGradient>
            <linearGradient id="icon-right" x1="64" y1="15" x2="104" y2="55" gradientUnits="userSpaceOnUse">
              <stop stopColor="#178a82" />
              <stop offset="1" stopColor="#0f5f5a" />
            </linearGradient>
          </defs>
          <circle cx="36" cy="35" r="15" stroke="url(#icon-left)" strokeWidth="10" />
          <circle cx="84" cy="35" r="15" stroke="url(#icon-right)" strokeWidth="10" />
        </svg>
      </div>
    ),
    size
  );
}
