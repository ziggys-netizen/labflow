import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Closed mark for the tab icon: F2 accent square only (text will not fit). */
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
          background: "#F6F8F9",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            background: "#14476B",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
