/** BetConstruct backoffice benzeri açık tema */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Roboto", "system-ui", "sans-serif"] },
      colors: {
        bo: {
          bg: "#f3f5f8", panel: "#ffffff", line: "#e3e8ef", head: "#eef2f7",
          text: "#3b4351", muted: "#7b8594", blue: "#2a8bd8", green: "#3ec27a", red: "#e5534b", orange: "#f5a623", purple: "#6a5ae0",
        },
      },
      fontSize: { xxs: "11px" },
    },
  },
};
