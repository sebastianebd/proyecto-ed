import { LessonDetailView } from "@/components/lessons/LessonDetailView";

export default async function ParentLessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LessonDetailView lessonId={id} />;
}
