import { create, verify, getNumericDate } from "djwt";

const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

export async function createJWT(payload: Record<string, any>, expiresIn = "24h") {
  const exp = getNumericDate(new Date().getTime() + (24 * 60 * 60 * 1000)); // 24 hours
  
  return await create(
    { alg: "HS256", typ: "JWT" },
    { ...payload, exp },
    key
  );
}

export async function verifyJWT(token: string) {
  return await verify(token, key);
}

// ===== src/server/utils/validation.ts =====
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateRequired(value: any): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function validateLength(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>\"']/g, "");
}

export function validateDeploymentName(name: string): boolean {
  // Cloud Run service names must be lowercase letters, numbers, and hyphens
  const nameRegex = /^[a-z0-9-]+$/;
  return nameRegex.test(name) && name.length >= 1 && name.length <= 63;
}

export function validateGCPProjectId(projectId: string): boolean {
  // GCP project IDs must be 6-30 chars, lowercase letters, numbers, and hyphens
  const projectRegex = /^[a-z0-9-]{6,30}$/;
  return projectRegex.test(projectId);
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}