"use client";

import { BookOpen, CheckSquare, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: "lessons" | "attendance" | "admin" | "profile" };

const ITEMS_BY_ROLE: Record<Role, NavItem[]> = {
  PARENT: [
    { href: "/", label: "Lecciones", icon: "lessons" },
    { href: "/perfil", label: "Mi Perfil", icon: "profile" },
  ],
  TEACHER: [
    { href: "/profesor/asistencia", label: "Asistencia", icon: "attendance" },
    { href: "/perfil", label: "Mi Perfil", icon: "profile" },
  ],
  SUPER_ADMIN: [
    { href: "/admin", label: "Inicio", icon: "admin" },
    { href: "/perfil", label: "Mi Perfil", icon: "profile" },
  ],
};

function NavIcon({ name }: { name: NavItem["icon"] }) {
  if (name === "lessons") return <BookOpen className="h-5 w-5" />;
  if (name === "attendance") return <CheckSquare className="h-5 w-5" />;
  if (name === "admin") return <ShieldCheck className="h-5 w-5" />;
  return <User className="h-5 w-5" />;
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = ITEMS_BY_ROLE[role];

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 min-w-20 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                active ? "text-primary" : "text-fg-muted hover:text-fg"
              }`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
