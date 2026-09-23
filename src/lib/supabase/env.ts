import { z } from "zod";

const schema = z.object({
  url: z.url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  anonKey: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

export function getSupabaseEnv() {
  const parsed = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Missing/invalid Supabase env vars: ${parsed.error.issues.map((i) => i.message).join("; ")}. Copy .env.example to .env.local and fill in your Supabase project's values.`,
    );
  }

  return parsed.data;
}
