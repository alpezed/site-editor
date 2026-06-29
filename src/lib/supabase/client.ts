"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/** Browser-side Supabase client for use in Client Components. */
export function createClient() {
  return createBrowserClient(env.supabase.url, env.supabase.anonKey);
}
