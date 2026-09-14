import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${trimNum(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trimNum(n / 1_000)}k`;
  return String(n);
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n === 0) return "free";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${trimNum(n)}`;
}

function trimNum(n: number): string {
  return n.toFixed(n >= 10 ? 0 : 1).replace(/\.0$/, "");
}

export function logoUrl(providerId: string): string {
  return `https://models.dev/logos/${encodeURIComponent(providerId)}.svg`;
}
