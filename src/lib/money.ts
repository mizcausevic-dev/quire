import { AppError } from "./errors";

const MODELS = ["free", "subscription", "one_time", "usage", "contact"] as const;
export type PriceModel = (typeof MODELS)[number];

export function parseMoney(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new AppError("Enter prices as a positive amount with up to two decimal places.", "price");
  }
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  if (cents > 1_000_000_000) {
    throw new AppError("That price is larger than this catalog allows.", "price");
  }
  return cents;
}

export function formatMoney(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
  }
}

export function assertCurrency(input: string): string {
  const value = input.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new AppError("Use a three-letter currency code.", "currency");
  return value;
}

export function isPriceModel(value: string): value is PriceModel {
  return (MODELS as readonly string[]).includes(value);
}

export function priceLabel(input: {
  model: PriceModel;
  amountCents: number | null;
  currency: string;
  interval: "month" | "year" | null;
  label: string;
}): string {
  if (input.model === "free") return input.label || "Free";
  if (input.model === "contact" || input.amountCents === null) return input.label || "Contact for price";
  const amount = formatMoney(input.amountCents, input.currency);
  if (input.model === "subscription" && input.interval) return `${input.label}: ${amount} / ${input.interval}`;
  return `${input.label}: ${amount}`;
}
