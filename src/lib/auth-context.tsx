"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "./supabase";
import { useRouter } from "next/navigation";
import { fetchProfile, type Profile } from "./admin";

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Get initial session
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const p = await fetchProfile(user.id);
        setProfile(p);
      }
      setLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const p = await fetchProfile(currentUser.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
        setLoading(false);
        router.refresh();
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    console.log("[Auth] signOut called");
    console.log("[Auth] supabase client:", supabase);
    console.log("[Auth] supabase.auth:", supabase.auth);
    console.log("[Auth] calling supabase.auth.signOut()...");
    try {
      // Add timeout to detect hanging requests
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("signOut timeout after 5s")), 5000)
      );

      const signOutPromise = supabase.auth.signOut();
      console.log("[Auth] signOut promise created");

      const result = await Promise.race([signOutPromise, timeoutPromise]);
      console.log("[Auth] signOut result:", result);

      const { error } = result as { error: unknown };
      console.log("[Auth] signOut response:", { error });
      if (error) {
        console.error("[Auth] Sign out error:", error);
      }
    } catch (err) {
      console.error("[Auth] signOut exception:", err);
    }
    console.log("[Auth] clearing local state...");
    setUser(null);
    setProfile(null);
    console.log("[Auth] redirecting to /...");
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
