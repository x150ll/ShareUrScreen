// src/theme/index.ts — ألوان من اللوقو بالضبط
// بنفسجي #7B2FFF ← أعلى يسار اللوقو
// أزرق   #00B4FF ← أسفل يمين اللوقو

export const Colors = {
  bg: {
    primary:  '#0A0A0F',
    secondary:'#111118',
    card:     '#16161F',
    elevated: '#1E1E2B',
  },
  brand: {
    purple:      '#7B2FFF',
    blue:        '#00B4FF',
    purpleLight: '#9B5FFF',
    blueLight:   '#40CFFF',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error:   '#EF4444',
    live:    '#EF4444',
  },
  text: {
    primary:   '#FFFFFF',
    secondary: '#A0A0C0',
    muted:     '#5A5A7A',
  },
  border: {
    default: '#2A2A3E',
    subtle:  '#1A1A28',
  },
};

export const Typography = {
  sizes: {
    xs: 11, sm: 13, md: 15, lg: 17,
    xl: 20, xxl: 24, xxxl: 32,
  },
  weights: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
    black:    '900' as const,
  },
};

export const Spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:48 };
export const Radius  = { sm:8, md:12, lg:16, xl:24, full:9999 };
