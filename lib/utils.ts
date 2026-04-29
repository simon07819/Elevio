import { clsx, type ClassValue } from "clsx";
import type { Direction, Floor, HoistRequest } from "@/types/hoist";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function getDirection(fromSortOrder: number, toSortOrder: number): Exclude<Direction, "idle"> {
  return toSortOrder > fromSortOrder ? "up" : "down";
}

export function floorById(floors: Floor[], id: string) {
  return floors.find((floor) => floor.id === id);
}

function trimDecimal(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
}

export function floorLabelForSortOrder(sortOrder: number) {
  if (sortOrder < 0) {
    return `P${trimDecimal(Math.abs(sortOrder))}`;
  }

  if (sortOrder === 0) {
    return "RDC";
  }

  return trimDecimal(sortOrder);
}

export function formatFloorLabel(floor?: Pick<Floor, "label" | "sort_order"> | null) {
  if (!floor) {
    return "?";
  }

  const sortOrder = Number(floor.sort_order);

  if (sortOrder <= 0) {
    return floorLabelForSortOrder(sortOrder);
  }

  return floor.label || floorLabelForSortOrder(sortOrder);
}

export function formatWaitTime(startedAt: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60000));

  if (minutes < 1) {
    return "< 1 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest.toString().padStart(2, "0")}`;
}

/** Affiche une heure Postgres (`HH:MM` ou `HH:MM:SS`) en 12 h avec AM/PM (heure 1–12). */
export function formatPostgresTimeToAmPm(isoTime: string | null | undefined): string {
  const raw = (isoTime ?? "07:00:00").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!raw) {
    return "7:00 AM";
  }
  const h24 = Math.min(23, Math.max(0, Number(raw[1])));
  const minuteNum = Math.min(59, Math.max(0, Number(raw[2])));
  const mm = String(minuteNum).padStart(2, "0");
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${period}`;
}

export function requestDirectionLabel(direction: Direction) {
  if (direction === "up") return "Montee";
  if (direction === "down") return "Descente";
  return "Stable";
}

export function statusLabel(status: HoistRequest["status"]) {
  const labels: Record<HoistRequest["status"], string> = {
    pending: "En attente",
    assigned: "Pris en charge",
    arriving: "En approche",
    boarded: "A bord",
    completed: "Complete",
    cancelled: "Annule",
  };

  return labels[status];
}

export function makeQrUrl(origin: string, projectId: string, floorToken: string) {
  return `${origin.replace(/\/$/, "")}/request?projectId=${encodeURIComponent(
    projectId,
  )}&floorToken=${encodeURIComponent(floorToken)}`;
}

export function estimateArrivalWindow({
  currentElevatorSortOrder,
  passengerFloorSortOrder,
  pendingRequestsAhead,
}: {
  currentElevatorSortOrder: number;
  passengerFloorSortOrder: number;
  pendingRequestsAhead: number;
}) {
  const floorDistance = Math.abs(passengerFloorSortOrder - currentElevatorSortOrder);
  const directTravelMinutes = Math.max(1, Math.ceil(floorDistance * 0.45));
  const stopBufferMinutes = 1;
  const queueMinutes = Math.max(0, pendingRequestsAhead) * 2;
  const baseMinutes = Math.max(1, directTravelMinutes + stopBufferMinutes + queueMinutes);
  const min = Math.max(1, baseMinutes - 1);
  const max = baseMinutes + (pendingRequestsAhead > 0 ? 2 : 1);

  return {
    min,
    max,
    label: `Arrivee estimee dans environ ${min} a ${max} min`,
  };
}
