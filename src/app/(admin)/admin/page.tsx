import { asc } from "drizzle-orm";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { calculateKpis } from "@/lib/kpis";
import { getServerProfile } from "@/lib/session-server";

export default async function AdminHomePage() {
  const [profile, kpis, classRows] = await Promise.all([
    getServerProfile(),
    calculateKpis(),
    db.select({ id: classes.id, name: classes.name, status: classes.status }).from(classes).orderBy(asc(classes.createdAt)),
  ]);

  return <AdminDashboard adminName={profile?.fullName ?? "Admin"} initialKpis={kpis} classes={classRows} />;
}
