import { revalidatePath } from "next/cache";

/** Staff route trees that render evaluation cockpits (`/recruitment/*` redirects to `/admin`). */
const EVALUATION_BASE_PATHS = ["/admin/evaluations", "/subadmin/evaluations"] as const;

/**
 * Revalidates every view that renders evaluation, task or certificate data for an enrollment.
 */
export function revalidateEvaluationViews(enrollmentId?: string): void {
  for (const base of EVALUATION_BASE_PATHS) {
    revalidatePath(base);
    if (enrollmentId) {
      revalidatePath(`${base}/${enrollmentId}`);
    }
  }
  revalidatePath("/intern/dashboard");
}
