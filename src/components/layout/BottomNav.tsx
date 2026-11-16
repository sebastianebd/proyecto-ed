"use client";

import { Baby, BookOpen, CheckSquare, GraduationCap, ShieldCheck, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth";

type IconName = "lessons" | "attendance" | "admin" | "classes" | "users" | "students" | "profile";
type NavItem = { href: string; label: string; icon: IconName };

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
    { href: "/admin/clases", label: "Clases", icon: "classes" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "users" },
    { href: "/admin/alumnos", label: "Niños", icon: "students" },
    { href: "/perfil", label: "Perfil", icon: "profile" },
  ],
};

function NavIcon({ name }: { name: IconName }) {
  if (name === "lessons") return <BookOpen className="h-5 w-5" />;
  if (name === "attendance") return <CheckSquare className="h-5 w-5" />;
  if (name === "admin") return <ShieldCheck className="h-5 w-5" />;
  if (name === "classes") return <GraduationCap className="h-5 w-5" />;
  if (name === "users") return <Users className="h-5 w-5" />;
  if (name === "students") return <Baby className="h-5 w-5" />;
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
      <div className="mx-auto flex max-w-2xl items-center justify-around px-1 py-1.5">
        {items.map((item) => {
          const active =
            item.href === "/" || item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-semibold transition-colors ${
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
