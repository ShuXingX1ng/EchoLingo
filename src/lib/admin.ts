import { createClient } from "./supabase";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: "user" | "admin";
  created_at: string;
  updated_at: string;
}

// Fetch the current user's profile (includes role)
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

// Fetch all profiles (admin only)
export async function fetchAllProfiles(): Promise<Profile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Profile[];
}

// Update a user's role (admin only)
export async function updateUserRole(
  userId: string,
  role: "user" | "admin"
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  return !error;
}
