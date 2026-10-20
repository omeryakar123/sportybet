/**
 * Tasarım token'ları referans HTML'den (docs/references/site-html) alındı.
 * Tam 1:1 renk değerleri, sen tailwind/css dosyalarını gönderince güncellenecek.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#0f0f12", rail: "#141417", header: "#17171a", panel: "#1c1c20", surface: "#202025",
        card: "#232329", "card-2": "#2b2b31", elevated: "#303037", field: "#26262c", line: "#404048",
        fg: "#f4f4f5", soft: "#d4d4d8", muted: "#a1a1aa", subtle: "#8b8b94", dim: "#71717a",
        primary: "#00ae61", win: "#2fd476", loss: "#f6383a",
      },
      spacing: { "rail-w": "72px", "sidebar-w": "240px", "header-h": "64px", "bottom-nav-h": "60px" },
    },
  },
};
