import type { Project } from "@/types/hoist";

/**
 * A project is considered "configured" when:
 * - It has a non-empty name
 * - It has at least one active floor
 * - It has at least one elevator
 *
 * If the DB `configured` flag is explicitly true, trust it.
 * Otherwise, infer from the data.
 */
export function isProjectConfigured(
  project: Project,
  floorCount: number,
  elevatorCount: number,
): boolean {
  if (project.configured === true) return true;
  if (!project.name?.trim()) return false;
  if (floorCount < 1) return false;
  if (elevatorCount < 1) return false;
  return true;
}

/**
 * i18n key for the "not configured" blocking message.
 */
export const PROJECT_NOT_CONFIGURED_KEY = "project.notConfigured";
