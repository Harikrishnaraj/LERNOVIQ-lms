import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnquiryRow {
  id: string;
  kind: "consultation" | "demo";
  name: string;
  email: string;
  organization: string;
  country: string;
  industry: string;
  solution: string;
  audience: string | null;
  timeline: string | null;
  details: string;
  createdAt: string;
}

// T-264 (F-963): newest first; RLS returns rows only to `enquiry.read` holders.
export async function listEnquiries(supabase: SupabaseClient, limit = 200): Promise<EnquiryRow[]> {
  const { data, error } = await supabase
    .from("enquiries")
    .select("id, kind, name, email, organization, country, industry, solution, audience, timeline, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listEnquiries failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    email: r.email,
    organization: r.organization,
    country: r.country,
    industry: r.industry,
    solution: r.solution,
    audience: r.audience,
    timeline: r.timeline,
    details: r.details,
    createdAt: r.created_at,
  }));
}
