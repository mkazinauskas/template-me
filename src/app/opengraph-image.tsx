import { ImageResponse } from "next/og";

// Social-share card shown when the landing page is linked on X, Slack,
// LinkedIn, etc. Next automatically wires this into `openGraph.images` and
// `twitter.images`, so the metadata in layout.tsx doesn't reference it.
export const alt = "Template Me — turn Word docs into fillable PDF templates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "#ffffff",
              color: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "34px",
              fontWeight: 700,
            }}
          >
            {"{ }"}
          </div>
          <div style={{ fontSize: "34px", fontWeight: 600 }}>Template Me</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Turn Word docs into fillable PDF templates
          </div>
          <div style={{ fontSize: "32px", color: "rgba(255,255,255,0.6)" }}>
            {"Upload a .docx with {{placeholder}} tags, fill one or bulk-fill from CSV, download a PDF"}
          </div>
        </div>

        <div style={{ fontSize: "26px", color: "rgba(255,255,255,0.5)" }}>
          Free &amp; open source · self-hostable with Docker
        </div>
      </div>
    ),
    { ...size }
  );
}
