import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { Assignment, AssignmentSubmission } from "../types";

export function useAssignments(courseId?: number) {
  return useQuery({
    queryKey: ["assignments", courseId ?? "all"],
    queryFn: async () => {
      const url = courseId ? `/assignments?course_id=${courseId}` : "/assignments";
      const res = await api.get<Assignment[]>(url);
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}

export function useAssignmentSubmissions(assignmentId?: number) {
  return useQuery({
    queryKey: ["assignment-submissions", assignmentId],
    enabled: !!assignmentId,
    queryFn: async () => {
      const res = await api.get<AssignmentSubmission[]>(`/assignments/${assignmentId}/submissions`);
      return Array.isArray(res.data) ? res.data : [];
    },
  });
}
