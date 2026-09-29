import type { Role } from "./auth";

export const STATUS = {
  HR: "HR Review",
  HEAD: "Global Head Review",
  CEO: "CEO Review",
  REQUESTER: "With Requester",
  APPROVED: "Approved",
  PAID: "Paid",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
} as const;

/** Which request statuses each role can see. HR sees everything; others see their queue plus Completed. */
export const QUEUE: Record<Role, string[]> = {
  HR: Object.values(STATUS),
  GLOBAL_HEAD: [STATUS.HEAD, STATUS.COMPLETED],
  CEO: [STATUS.CEO, STATUS.COMPLETED],
  FINANCE: [STATUS.APPROVED, STATUS.PAID, STATUS.COMPLETED],
};

/** The status in which each role's approval is needed. */
export const STAGE_OF: Partial<Record<Role, string>> = { HR: STATUS.HR, GLOBAL_HEAD: STATUS.HEAD, CEO: STATUS.CEO };

export type SendTarget = "REQUESTER" | "HR" | "HEAD";
/** Who each approver may send a request back to. */
export const SEND_TO: Record<Role, SendTarget[]> = { HR: ["REQUESTER"], GLOBAL_HEAD: ["HR"], CEO: ["HEAD", "HR"], FINANCE: [] };
export const TARGET_LABEL: Record<SendTarget, string> = { REQUESTER: "Requester", HR: "HR", HEAD: "Global Head, HR" };
export const ROLE_LABEL: Record<Role, string> = { HR: "HR", GLOBAL_HEAD: "Global Head, HR", FINANCE: "Finance", CEO: "CEO" };
