import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

export type Role = "HR" | "GLOBAL_HEAD" | "FINANCE" | "CEO";
export type Session = { email: string; name: string; role: Role };

const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (16+ chars)");
  return new TextEncoder().encode(s);
};

export const signToken = (payload: object, exp: string) =>
  new SignJWT({ ...payload }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(exp).sign(key());

export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    return (await jwtVerify(token, key())).payload as T;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("sa_session")?.value;
  if (!token) return null;
  const p = await verifyToken<{ email: string; typ: string }>(token);
  if (!p || p.typ !== "session") return null;
  // Re-check against the staff table so removing someone revokes access.
  const pool = await db();
  const { rows } = await pool.query("SELECT email,name,role FROM staff WHERE email=$1", [p.email]);
  return rows[0] ?? null;
}
