// Польский NIP: 10 цифр, последняя — контрольная.
const WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

export function normalizeNip(input: string): string {
  return input.replace(/^PL/i, "").replace(/[\s-]/g, "");
}

export function isValidNip(input: string): boolean {
  const nip = normalizeNip(input);
  // Формат, который принимает KSeF: первая цифра не 0, 2-я и 3-я не обе нули.
  if (!/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/.test(nip)) return false;
  const sum = WEIGHTS.reduce((s, w, i) => s + w * Number(nip[i]), 0);
  const check = sum % 11;
  return check !== 10 && check === Number(nip[9]);
}

/** Случайный корректный NIP — только для тестовой среды KSeF. */
export function randomNip(rand: () => number = Math.random): string {
  for (;;) {
    const d = [1 + Math.floor(rand() * 9), ...Array.from({ length: 8 }, () => Math.floor(rand() * 10))];
    const check = WEIGHTS.reduce((s, w, i) => s + w * d[i]!, 0) % 11;
    if (check === 10) continue;
    const nip = d.join("") + check;
    if (isValidNip(nip)) return nip;
  }
}
