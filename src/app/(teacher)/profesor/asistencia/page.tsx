import { TeacherAttendanceView } from "@/components/teacher/TeacherAttendanceView";
import { requireServerProfile } from "@/lib/session-server";
import { currentWeekSundayInSantiago } from "@/lib/timezone";

export default async function TeacherAttendancePage() {
  const profile = await requireServerProfile({ allowedRoles: ["TEACHER", "SUPER_ADMIN"] });
  return <TeacherAttendanceView userRole={profile.role} defaultSundayYmd={currentWeekSundayInSantiago()} />;
}
