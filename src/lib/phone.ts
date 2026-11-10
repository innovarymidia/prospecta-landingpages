export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("0")) {
    return `55${digits}`;
  }
  return digits;
}

/**
 * Gera variantes equivalentes de telefone brasileiro (com ou sem DDI 55,
 * e com ou sem o nono digito apos o DDD) para garantir casamento exato no webhook.
 */
export function buildPhoneMatchVariants(rawPhone: string): string[] {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);

  const rawDigits = rawPhone.replace(/\D/g, "");
  if (rawDigits) variants.add(rawDigits);

  if (normalized.startsWith("55")) {
    const local = normalized.slice(2);
    if (local) variants.add(local);

    if (local.length === 11 && local[2] === "9") {
      const withoutNine = `${local.slice(0, 2)}${local.slice(3)}`;
      variants.add(withoutNine);
      variants.add(`55${withoutNine}`);
    } else if (local.length === 10 && /^[6-9]/.test(local[2] || "")) {
      const withNine = `${local.slice(0, 2)}9${local.slice(2)}`;
      variants.add(withNine);
      variants.add(`55${withNine}`);
    }
  }

  return Array.from(variants);
}
