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
        <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
          <defs>
            <linearGradient id="icon-mark" x1="14" y1="27" x2="91" y2="73" gradientUnits="userSpaceOnUse">
              <stop stopColor="#afeae4" />
              <stop offset="0.48" stopColor="#3abdb3" />
              <stop offset="1" stopColor="#178a82" />
            </linearGradient>
          </defs>
          <path d="M42 35C33 25 18 28 18 50C18 72 37 78 49 61L66 38C78 22 95 32 92 53C91 61 87 67 81 71" stroke="url(#icon-mark)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M72 63L82 72" stroke="#d6f5f1" strokeWidth="13" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size
  );
}
