/** Tasarım token'ları kullanıcının verdiği referans CSS'ten (docs/references/site-css) birebir alındı. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        page: "#17171a", "panel-deep": "#141417", rail: "#1b1b1f", field: "#1b1b1f", panel: "#1d1d21", header: "#1f1f23", row: "#1c1c20",
        card: "#232328", "card-2": "#26262c", "surface-hover": "#2b2b31", elevated: "#323239", "elevated-hover": "#3c3c44",
        line: "#2d2d33", "line-strong": "#404048",
        fg: "#ffffff", muted: "#c2c2ca", soft: "#9b9ba4", subtle: "#85858f", dim: "#64646d",
        primary: { DEFAULT: "#ffbe7b", hover: "#ffca95", soft: "#ffd8ae", fg: "#17171a" },
        win: "#2fd476", loss: "#f6383a", odds: "#428dff", caution: "#f5c518",
      },
      borderRadius: { sm: ".25rem", md: ".375rem", lg: ".5rem", xl: ".75rem", "2xl": "1rem" },
      transitionTimingFunction: { side: "cubic-bezier(.22,1,.36,1)" },
      keyframes: {
        "slip-reveal": { from: { opacity: "0", transform: "translateY(16px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "slip-item": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "sports-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        "slip-reveal": "slip-reveal .42s cubic-bezier(.22,1,.36,1)",
        "slip-item": "slip-item .22s ease",
        "sports-fade": "sports-fade .26s cubic-bezier(.22,1,.36,1)",
        float: "float 5s ease-in-out infinite",
      },
    },
  },
};
