import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFmt = new Intl.NumberFormat("en-US");
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const currencyFmt0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatNumber(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "0";
  return numberFmt.format(v);
}

export function formatCurrency(n: number | string | null | undefined, opts?: { decimals?: 0 | 2 }): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "$0.00";
  return (opts?.decimals === 0 ? currencyFmt0 : currencyFmt).format(v);
}
