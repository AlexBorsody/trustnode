"use client";
import { useAuth } from "./useAuth";
export default function AccountNav() {
  const { session, ready } = useAuth();
  if (!ready) return <a href="/account">Account</a>;
  return session ? <a href="/account">My account</a> : <><a href="/login">Sign in</a><a href="/signup">Create account</a></>;
}
