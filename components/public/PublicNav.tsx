"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/pricing", label: "Tarifs" },
  { href: "/scan", label: "Passager" },
  { href: "/operator", label: "Opérateur" },
  { href: "/admin/login", label: "Admin" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 lg:px-8">
      <BrandLogo size="sm" priority clickable tone="light" />

      {/* Desktop */}
      <ul className="hidden items-center gap-6 sm:flex">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm font-bold text-slate-300 transition hover:text-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/operator"
            className="rounded-2xl bg-yellow-400 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-300"
          >
            Commencer
          </Link>
        </li>
      </ul>

      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="touch-target rounded-2xl p-2 text-white sm:hidden"
        aria-label="Menu"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile menu */}
      {open && (
        <div className="absolute inset-x-0 top-full z-50 border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur sm:hidden">
          <ul className="grid gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/operator"
                onClick={() => setOpen(false)}
                className="block rounded-2xl bg-yellow-400 px-4 py-3 text-center text-sm font-black text-slate-950"
              >
                Commencer
              </Link>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}
