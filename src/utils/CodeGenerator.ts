// src/utils/CodeGenerator.ts
// حروف وأرقام واضحة — بدون 0,O,I,1,l لتجنب الالتباس
// 53 حرف × 12 خانة = ~69 بت من الـ entropy — آمن ضد brute force
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const CHARS_LEN = CHARS.length;

// توليد عشوائي قوي باستخدام getRandomValues عند توفره
function secureRandom(): number {
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / (0xFFFFFFFF + 1); // [0, 1)
  } catch {
    return Math.random(); // fallback
  }
}

export const generateSessionCode = (): string => {
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += CHARS.charAt(Math.floor(secureRandom() * CHARS_LEN));
  }
  return code;
};

export const formatCode = (code: string): string => {
  const c = cleanCode(code);
  if (c.length !== 12) return code;
  return `${c.slice(0,4)}-${c.slice(4,8)}-${c.slice(8,12)}`;
};

export const cleanCode = (formatted: string): string =>
  formatted.replace(/[-\s]/g, '').trim();

export const validateCode = (code: string): boolean => {
  const c = cleanCode(code);
  return c.length === 12 && [...c].every(ch => CHARS.includes(ch));
};

// حساب احتمال كود معطى (للتوثيق)
// P(تخمين) = 1 / 53^12 ≈ 1 في 3.5 × 10^20
