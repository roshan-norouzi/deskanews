import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          page: '#f8fafc',
          card: '#ffffff',
          muted: '#f1f5f9',
          border: '#e2e8f0',
        },
        sidebar: {
          DEFAULT: '#ffffff',
          hover: '#f8fafc',
          active: '#eef2ff',
          border: '#e2e8f0',
          text: '#475569',
          heading: '#64748b',
        },
        success: {
          DEFAULT: '#059669',
          soft: '#d1fae5',
        },
        warning: {
          DEFAULT: '#d97706',
          soft: '#fef3c7',
        },
        danger: {
          DEFAULT: '#dc2626',
          soft: '#fee2e2',
        },
        info: {
          DEFAULT: '#2563eb',
          soft: '#dbeafe',
        },
      },
      fontFamily: {
        sans: ['var(--font-vazirmatn)', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        elevated: '0 8px 24px -12px rgb(15 23 42 / 0.18)',
      },
      borderRadius: {
        card: '0.75rem',
      },
      minHeight: {
        control: '2.5rem',
      },
      spacing: {
        header: '4rem',
        sidebar: '18rem',
      },
      zIndex: {
        header: '30',
        overlay: '40',
        sidebar: '50',
        modal: '70',
        toast: '100',
      },
    },
  },
  plugins: [],
};

export default config;
