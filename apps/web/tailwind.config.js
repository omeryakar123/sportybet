/** Tasarım token'ları kullanıcının verdiği referans CSS'ten (docs/references/site-css) birebir alındı. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        // skorbord rakamları ve başlıklar: dar, sportif
        num: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        lift: "inset 0 1px 0 rgba(255,255,255,.045), 0 1px 2px rgba(0,0,0,.35)",
        float: "inset 0 1px 0 rgba(255,255,255,.06), 0 18px 48px -12px rgba(0,0,0,.65)",
        pick: "inset 0 1px 0 rgba(255,255,255,.35), 0 6px 18px -6px rgba(0,255,129,.65)",
      },
      colors: {
        // Gamdom ekran görüntülerinden ölçülen palet
        page: "#0b0f13", "panel-deep": "#080b0e", rail: "#0f161c", field: "#0b0f13", panel: "#0f161c", header: "#0f161c", row: "#12191f",
        card: "#161c22", "card-2": "#1b2127", "surface-hover": "#1f262d", elevated: "#21272d", "elevated-hover": "#2a3138",
        line: "#1b2228", "line-strong": "#28313a",
        fg: "#ffffff", muted: "#c0c5cc", soft: "#a3afbb", subtle: "#8794a2", dim: "#7b8896",
        primary: { DEFAULT: "#00ff81", hover: "#4dffa6", soft: "#9dffcd", fg: "#03140b" },
        accent: "#00e8ff",
        win: "#00ff81", loss: "#ff4d5e", odds: "#00ff81", caution: "#ffd731", live: "#e5243b",
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
