"use client";

import Link from "next/link";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "light" | "dark";
  /** When true, logo is a link to home page. */
  clickable?: boolean;
};

const sizes = {
  sm: {
    icon: "size-9 rounded-xl",
    letter: "text-xl",
    mark: "h-5 w-[3px]",
    innerGap: "gap-1",
    text: "text-2xl",
    gap: "gap-2.5",
  },
  md: {
    icon: "size-12 rounded-2xl",
    letter: "text-3xl",
    mark: "h-7 w-1",
    innerGap: "gap-1",
    text: "text-3xl",
    gap: "gap-3",
  },
  lg: {
    icon: "size-14 rounded-2xl sm:size-16",
    letter: "text-4xl sm:text-5xl",
    mark: "h-8 w-1 sm:h-9 sm:w-[5px]",
    innerGap: "gap-1",
    text: "text-4xl sm:text-5xl",
    gap: "gap-3.5",
  },
};

function LogoContent({ size = "md", tone = "dark", className = "" }: { size?: "sm" | "md" | "lg"; tone?: "light" | "dark"; className?: string }) {
  const logoSize = sizes[size];
  const textColor = tone === "light" ? "text-slate-950" : "text-white";

  return (
    <span className={`inline-flex items-center ${logoSize.gap} ${className}`} aria-label="Elevio">
      <span
        className={`relative grid shrink-0 place-items-center border border-white/20 bg-[#020617] text-white shadow-sm ${logoSize.icon}`}
      >
        <span className={`inline-flex items-center justify-center ${logoSize.innerGap}`}>
          <span className={`font-black leading-none tracking-[-0.08em] ${logoSize.letter}`}>E</span>
          <span className={`rounded-full bg-[#EAB308] ${logoSize.mark}`} />
        </span>
      </span>
      <span className={`font-black leading-none tracking-[-0.06em] ${textColor} ${logoSize.text}`}>
        Elevio
      </span>
    </span>
  );
}

export function BrandLogo({ className = "", size = "md", tone = "dark", clickable = false }: BrandLogoProps) {
  if (!clickable) {
    return <LogoContent size={size} tone={tone} className={className} />;
  }
  return (
    <Link href="/" className="inline-flex no-underline">
      <LogoContent size={size} tone={tone} className={className} />
    </Link>
  );
}
