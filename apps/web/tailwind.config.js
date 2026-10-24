/** Tasarım token'ları kullanıcının verdiği referans CSS'ten (docs/references/site-css) birebir alındı. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        // skorbord rakamları ve başlıklar: dar, sportif
        num: ["Barlow Semi Condensed", "Manrope", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        lift: "inset 0 1px 0 rgba(255,255,255,.045), 0 1px 2px rgba(0,0,0,.35)",
        float: "inset 0 1px 0 rgba(255,255,255,.06), 0 18px 48px -12px rgba(0,0,0,.65)",
        pick: "inset 0 1px 0 rgba(255,255,255,.35), 0 6px 18px -6px rgba(31,232,138,.65)",
      },
      colors: {
        // Lacivert + neon yeşil tema
        page: "#0f1923", "panel-deep": "#0b131c", rail: "#121d29", field: "#0d1620", panel: "#15212e", header: "#121d29", row: "#17232f",
        card: "#1a2734", "card-2": "#1d2b39", "surface-hover": "#213141", elevated: "#223244", "elevated-hover": "#2a3c50",
        line: "#1f2e3d", "line-strong": "#2c3e52",
        fg: "#ffffff", muted: "#c3ccd8", soft: "#9aa8b8", subtle: "#7f8ea0", dim: "#5d6c7e",
        primary: { DEFAULT: "#1fe88a", hover: "#4ff0a4", soft: "#9cf7c9", fg: "#062314" },
        accent: "#19e3d1",
        win: "#1fe88a", loss: "#ff4d5e", odds: "#1fe88a", caution: "#ffc93c", live: "#ff3b4f",
      },
      borderRadius: { sm: ".25rem", md: ".375rem", lg: ".5rem", xl: ".75rem", "2xl": "1rem" },
      transitionTimingFunction: { side: "cubic-bezier(.22,1,.36,1)" },
      keyframes: {
        "slip-reveal": { from: { opacity: "0", transform: "translateY(16px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "slip-item": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "sports-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        bump: { "0%": { transform: "scale(.6)" }, "60%": { transform: "scale(1.25)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "slip-reveal": "slip-reveal .42s cubic-bezier(.22,1,.36,1)",
        "slip-item": "slip-item .22s ease",
        "sports-fade": "sports-fade .26s cubic-bezier(.22,1,.36,1)",
        float: "float 5s ease-in-out infinite",
        bump: "bump .32s cubic-bezier(.22,1,.36,1)",
      },
    },
  },
};
