import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);

// Every device signs in as an anonymous guest. The session is kept in
// localStorage, so a refreshed or relocked phone comes back as the same user.
export async function ensureSignedIn(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) {
    throw new Error(error?.message ?? "Could not sign in");
  }
  return signIn.user.id;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Something went wrong";
}
