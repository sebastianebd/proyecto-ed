import { UsersManager } from "@/components/admin/UsersManager";
import { listAdminUsers } from "@/lib/admin-users";
import { getServerSessionUser } from "@/lib/session-server";

export default async function AdminUsersPage() {
  const [me, { items, nowMs }] = await Promise.all([getServerSessionUser(), listAdminUsers()]);
  return <UsersManager initialUsers={items} initialNowMs={nowMs} currentUserId={me?.id ?? ""} />;
}
