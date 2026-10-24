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
        pick: "rgba(0,255,102,.28) 0 0 6.2px",
        glow: "rgba(0,255,102,.28) 0 0 6.2px",
      },
      colors: {
        // gamdom.com getComputedStyle ölçümleri
        page: "#080d13", "panel-deep": "#06090e", rail: "#0f151b", field: "#19212a", panel: "#0f151b", header: "#080d13", row: "#0f1d28",
        card: "#131a22", "card-2": "#19212a", "card-blue": "#0f1d28", "surface-hover": "#19212a", elevated: "#252f3a", "elevated-hover": "#2e3945",
        line: "#19212a", "line-strong": "#252f3a",
        fg: "#f9f9f9", muted: "#bfc3c7", soft: "#a2adb9", subtle: "#818e9d", dim: "#818e9d",
        primary: { DEFAULT: "#00ff86", hover: "#4dffa8", soft: "#9dffcd", fg: "#06090e" },
        accent: "#00e8ff", lime: "#75fb56",
        win: "#00ff86", loss: "#da322c", odds: "#00ff86", caution: "#ffd900", live: "#da322c",
      },
      borderRadius: { sm: "4px", md: "6px", lg: "8px", xl: "10px", "2xl": "16px", "xl2": "12px" },
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
