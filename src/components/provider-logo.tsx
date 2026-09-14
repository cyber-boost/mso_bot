import { useState } from "react";
import { cn, logoUrl } from "@/lib/utils";

export function ProviderLogo({
  id,
  name,
  size = "md",
}: {
  id: string;
  name: string;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const dim = size === "sm" ? "size-5" : "size-6";
  const letter = (name || id).slice(0, 1).toUpperCase();
  if (failed) {
    return (
      <span
        className={cn(
          dim,
          "inline-flex shrink-0 items-center justify-center rounded-xs bg-accent text-micro font-medium text-accent-fg",
        )}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }
  return (
    <span className={cn(dim, "inline-flex shrink-0 items-center justify-center rounded-xs bg-accent p-px")}>
      <img
        src={logoUrl(id)}
        alt=""
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
