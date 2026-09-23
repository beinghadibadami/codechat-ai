import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

/**
 * Design tokens live as HSL triplets in index.css so that Tailwind's
 * slash-opacity syntax (e.g. `bg-panel/60`) keeps working. Theme swapping
 * happens purely by redefining those variables under `.light`, which means
 * almost no component needs a `dark:` variant.
 */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        // legacy alias — some older markup still says font-inter
        inter: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },

      colors: {
        // --- Core surfaces -------------------------------------------------
        background: "hsl(var(--background))",
        panel: "hsl(var(--surface-panel))",
        raised: "hsl(var(--surface-raised))",

        // --- Text ----------------------------------------------------------
        foreground: "hsl(var(--foreground))",
        faint: "hsl(var(--text-faint))",

        // --- Hairline / form ------------------------------------------------
        border: "hsl(var(--border))",
        "border-elevated": "hsl(var(--border-elevated))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // --- The only two functional accents ------------------------------
        amber: "hsl(var(--amber))",
        cyan: "hsl(var(--cyan))",

        // --- shadcn/ui contract -------------------------------------------
        primary: {
          DEFAULT: "hsl(var(--primary))",
          dark: "hsl(var(--primary-dark))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          elevated: "hsl(var(--card-elevated))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        // --- Backwards-compat aliases (pre-revamp markup) -----------------
        "background-elevated": "hsl(var(--surface-panel))",
        "background-surface": "hsl(var(--surface-raised))",
      },

      // `text-muted` should resolve to the muted *text* colour, which is what
      // every call site actually means. shadcn's `text-muted-foreground`
      // still works via the `muted` object above.
      textColor: {
        muted: "hsl(var(--text-muted))",
      },

      borderRadius: {
        // Small radii throughout — editor panels, not marketing cards
        lg: "var(--radius)",
        md: "calc(var(--radius) - 1px)",
        sm: "calc(var(--radius) - 2px)",
      },

      // Shadows are near-absent by design; a single hairline lift is enough
      boxShadow: {
        hairline: "0 0 0 1px hsl(var(--border))",
        panel: "0 1px 2px hsl(0 0% 0% / 0.18)",
        overlay: "0 8px 28px hsl(0 0% 0% / 0.30)",
      },

      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },

      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
      },

      spacing: {
        topbar: "3rem",     // 48px
        sidebar: "15rem",   // 240px
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.18s ease-out",
        "accordion-up": "accordion-up 0.18s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
