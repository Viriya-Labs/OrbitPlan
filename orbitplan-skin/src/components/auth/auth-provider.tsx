"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiRequestError, getCurrentUser, login as apiLogin, logout as apiLogout } from "@/lib/api";
import type { AuthUser } from "@/types/auth";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    setIsLoading(true);
    try {
      setUser(await getCurrentUser());
    } catch (error) {
      setUser(null);
      if (!(error instanceof ApiRequestError) || error.status !== 0) {
        throw error;
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email: string, password: string) {
        await apiLogin({ email, password });
        await refresh();
      },
      async logout() {
        try {
          await apiLogout();
        } catch {
          // Clear local auth state even if the API is unavailable during logout.
        } finally {
          setUser(null);
          setIsLoading(false);
        }
      },
      refresh,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
