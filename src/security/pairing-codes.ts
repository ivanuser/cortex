/**
 * 6-Digit Pairing Codes — Issue #21
 *
 * In-memory, time-limited pairing codes for quick device setup.
 * Codes are 6 random digits (000000–999999) with a 5-minute TTL.
 */
import crypto from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Role } from "./roles.js";
import { isValidRole } from "./roles.js";

const log = createSubsystemLogger("pairing-codes");

// ─── Types ───────────────────────────────────────

export interface PairingCodeEntry {
  code: string;
  role: Role;
  expiresAt: number;
  createdBy: string | null;
}

// ─── Constants ───────────────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CODE_LENGTH = 6;

// ─── In-Memory Store ─────────────────────────────

const codeStore = new Map<string, PairingCodeEntry>();

// Periodic cleanup (every 60s)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (cleanupInterval) {
    return;
  }
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of codeStore) {
      if (now >= entry.expiresAt) {
        codeStore.delete(code);
      }
    }
  }, 60_000);
  // Don't block process exit
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

// ─── Code Generation ─────────────────────────────

function generateCode(): string {
  // Generate a random 6-digit code (000000–999999)
  const num = crypto.randomInt(0, 1_000_000);
  return String(num).padStart(CODE_LENGTH, "0");
}

// ─── Public API ──────────────────────────────────

/**
 * Generate a new 6-digit pairing code.
 * @param role - Security role for the device that uses this code (defaults to "operator")
 * @param createdBy - Optional creator identifier for audit
 * @returns The generated code and TTL info
 */
export function generatePairingCode(
  role?: string,
  createdBy?: string,
): { code: string; expiresIn: number; role: Role } {
  ensureCleanup();

  const effectiveRole: Role = role && isValidRole(role) ? role : "operator";

  // Avoid collisions
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 100) {
      throw new Error("Failed to generate unique pairing code");
    }
  } while (codeStore.has(code));

  const expiresAt = Date.now() + DEFAULT_TTL_MS;
  codeStore.set(code, {
    code,
    role: effectiveRole,
    expiresAt,
    createdBy: createdBy ?? null,
  });

  log.info(`pairing code generated: role=${effectiveRole} expires_in=${DEFAULT_TTL_MS}ms`);

  return {
    code,
    expiresIn: DEFAULT_TTL_MS,
    role: effectiveRole,
  };
}

/**
 * Validate a pairing code without consuming it.
 * @returns The role if valid, or null if invalid/expired.
 */
export function validatePairingCode(code: string): { valid: true; role: Role } | { valid: false } {
  const trimmed = code.trim();
  const entry = codeStore.get(trimmed);
  if (!entry) {
    return { valid: false };
  }
  if (Date.now() >= entry.expiresAt) {
    codeStore.delete(trimmed);
    return { valid: false };
  }
  return { valid: true, role: entry.role };
}

/**
 * Consume a pairing code (one-time use).
 * @returns The role if valid and consumed, or null if invalid/expired.
 */
export function consumePairingCode(code: string): { valid: true; role: Role } | { valid: false } {
  const trimmed = code.trim();
  const entry = codeStore.get(trimmed);
  if (!entry) {
    return { valid: false };
  }
  if (Date.now() >= entry.expiresAt) {
    codeStore.delete(trimmed);
    return { valid: false };
  }
  // Consume it (one-time use)
  codeStore.delete(trimmed);
  log.info(`pairing code consumed: role=${entry.role}`);
  return { valid: true, role: entry.role };
}

/**
 * Get the number of active (non-expired) pairing codes.
 */
export function activePairingCodeCount(): number {
  const now = Date.now();
  let count = 0;
  for (const entry of codeStore.values()) {
    if (now < entry.expiresAt) {
      count++;
    }
  }
  return count;
}

/**
 * Clear all pairing codes (for testing or shutdown).
 */
export function clearPairingCodes(): void {
  codeStore.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
