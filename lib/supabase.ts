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
    const msg = String(error.message);
    // Only the old database says this about a story the app has opened: the SQL in Supabase needs re-running.
    if (msg === "This story is coming soon" || /function public\.(set_name_look|use_draw)/.test(msg)) {
      return "The game's database is out of date. Re-run supabase/migrations/0001_the_gathering.sql in Supabase, then try again.";
    }
    return msg;
  }
  return "Something went wrong";
}
