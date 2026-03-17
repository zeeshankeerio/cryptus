import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function formatPrice(price: number): string {
  if (price === 0) return '0';
  const absPrice = Math.abs(price);
  if (absPrice >= 1000) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (absPrice >= 1) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  if (absPrice >= 0.0001) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
  // For very small prices (alts/shitcoins)
  return price.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
