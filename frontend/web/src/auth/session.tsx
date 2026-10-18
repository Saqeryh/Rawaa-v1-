import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { configureApi } from "../api/client";

export interface Session { role: "doctor" | "patient"; token: string; patientId?: string }
interface Ctx { session: Session | null; signIn: (s: Session) => void; signOut: () => void; signedOutByUser: boolean }
const KEY = "rawa.session";
const SessionCtx = createContext<Ctx | null>(null);

function load(): Session | null {
  try { const raw = sessionStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const [signedOutByUser, setByUser] = useState(false);
  const signIn = useCallback((s: Session) => { sessionStorage.setItem(KEY, JSON.stringify(s)); setSession(s); setByUser(false); }, []);
  const signOut = useCallback(() => { sessionStorage.removeItem(KEY); setSession(null); setByUser(true); }, []);
  // An expired/invalid token (HTTP 401) is not a deliberate sign-out: the guard sends the user to the sign-in page.
  const expire = useCallback(() => { sessionStorage.removeItem(KEY); setSession(null); setByUser(false); }, []);
  useEffect(() => { configureApi({ onUnauthorized: expire }); return () => configureApi({ onUnauthorized: null }); }, [expire]);
  const value = useMemo(() => ({ session, signIn, signOut, signedOutByUser }), [session, signIn, signOut, signedOutByUser]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

/** Route guard: wrong or missing role goes to that role's sign-in page. */
export function RequireRole({ role, children }: { role: "doctor" | "patient"; children: ReactNode }) {
  const { session, signedOutByUser } = useSession();
  if (!session || session.role !== role) return <Navigate to={signedOutByUser && !session ? "/" : `/${role}/login`} replace />;
  return <>{children}</>;
}
