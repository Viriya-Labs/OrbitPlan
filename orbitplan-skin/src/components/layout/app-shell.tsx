"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/upload", label: "Upload" },
];

const getUserInitials = (email: string) =>
  email
    .split("@")[0]
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "OP";

const getUserDisplayName = (email: string) =>
  email
    .split("@")[0]
    .split(/[^a-zA-Z0-9]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;

export function AppShell({
  children,
  sidebarContent,
  sidebarCollapsedContent,
}: {
  children: ReactNode;
  sidebarContent?: ReactNode;
  sidebarCollapsedContent?: ReactNode;
}) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarStorageKey = user ? `orbitplan:sidebar:${user.id}` : null;
  const persistedSidebarPreference = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};

      const handleStorageChange = (event: Event) => {
        if (event instanceof StorageEvent && sidebarStorageKey && event.key && event.key !== sidebarStorageKey) return;
        onStoreChange();
      };

      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("orbitplan-sidebar-change", handleStorageChange);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("orbitplan-sidebar-change", handleStorageChange);
      };
    },
    () => {
      if (typeof window === "undefined") return "expanded";
      if (!sidebarStorageKey) return sidebarOpen ? "expanded" : "collapsed";
      return window.localStorage.getItem(sidebarStorageKey) ?? "expanded";
    },
    () => "expanded",
  );
  const resolvedSidebarOpen =
    persistedSidebarPreference === "collapsed" ? false : persistedSidebarPreference === "expanded" ? true : sidebarOpen;
  const isSidebarPinned = resolvedSidebarOpen;
  const isSidebarExpanded = resolvedSidebarOpen || sidebarHovered;
  const showSidebar = pathname !== "/";

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.push("/");
    }
  };

  const toggleSidebar = () => {
    const nextValue = !resolvedSidebarOpen;
    if (sidebarStorageKey) {
      window.localStorage.setItem(sidebarStorageKey, nextValue ? "expanded" : "collapsed");
      window.dispatchEvent(new Event("orbitplan-sidebar-change"));
      return;
    }
    setSidebarOpen(nextValue);
  };

  return (
    <div className="min-h-screen text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(6,9,15,0.76)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-6 py-4 2xl:px-10">
          <Link href="/" className="fade-in flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <Image
              src="/orbitplan-logo.png"
              alt="OrbitPlan logo"
              width={44}
              height={44}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] object-cover p-1"
              priority
            />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">OrbitPlan</p>
              <h1 className="text-xl font-bold tracking-tight brand-gradient">Mission Control</h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <span className="rounded-full border border-[rgba(56,255,179,0.32)] bg-[rgba(56,255,179,0.1)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--success)]">
                Admin
              </span>
            )}
            <nav className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            {!isLoading && (user ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              >
                Login
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-81px)] w-full max-w-[1800px] gap-0 px-3 py-3 sm:px-4 lg:px-6 2xl:px-10">
        {showSidebar && (
          <motion.aside
            animate={{ width: isSidebarExpanded ? 288 : 92 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
            onFocusCapture={() => setSidebarHovered(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSidebarHovered(false);
              }
            }}
            className="sticky top-3 hidden h-[calc(100vh-1.5rem)] shrink-0 overflow-hidden rounded-[30px] border border-[rgba(120,145,255,0.18)] bg-[linear-gradient(180deg,rgba(8,12,31,0.98)_0%,rgba(6,10,22,0.96)_100%)] shadow-[0_28px_70px_-42px_rgba(0,0,0,0.92)] lg:block"
          >
            <div className="flex h-full flex-col p-3">
              <div
                className={`flex items-center rounded-[24px] border border-[rgba(120,145,255,0.14)] bg-[rgba(255,255,255,0.03)] ${
                  isSidebarExpanded ? "justify-between p-3" : "justify-center px-2 py-3"
                }`}
              >
                {isSidebarExpanded && (
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Workspace</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">Meeting Controls</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={`rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.04)] p-2 text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] ${
                    isSidebarPinned ? "border-[rgba(56,255,179,0.28)] text-[var(--success)]" : ""
                  }`}
                  aria-label={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
                  title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    {isSidebarPinned ? (
                      <>
                        <path d="m9 4 6 6" />
                        <path d="m15 4-6 6" />
                        <path d="M12 10v9" />
                      </>
                    ) : (
                      <>
                        <path d="M12 3v8" />
                        <path d="m8 7 4-4 4 4" />
                        <path d="M9 14h6" />
                        <path d="M10 18h4" />
                      </>
                    )}
                  </svg>
                </button>
              </div>

              <div
                className={`mt-4 flex-1 rounded-[24px] border border-[rgba(120,145,255,0.12)] bg-[rgba(255,255,255,0.02)] ${
                  isSidebarExpanded ? "p-4" : "px-2 py-3"
                }`}
              >
                {isSidebarExpanded && sidebarContent ? (
                  sidebarContent
                ) : !isSidebarExpanded && sidebarCollapsedContent ? (
                  sidebarCollapsedContent
                ) : isSidebarExpanded ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Workspace Tools</p>
                      <p className="text-sm text-[var(--text-secondary)]">Quick access to account connections and sync controls.</p>
                    </div>
                    <Link
                      href="/integrations"
                      className="flex items-center gap-3 rounded-[20px] border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[rgba(108,242,255,0.35)] hover:bg-[rgba(108,242,255,0.08)]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(120,145,255,0.18)] bg-[rgba(7,12,30,0.72)] text-[var(--accent)]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                          <path d="M7 7h10v10H7z" />
                          <path d="M4 12h3" />
                          <path d="M17 12h3" />
                          <path d="M12 4v3" />
                          <path d="M12 17v3" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block">Integrations</span>
                        <span className="block text-xs font-medium text-[var(--text-secondary)]">Zoom, Teams, Jira, and more</span>
                      </span>
                    </Link>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Link
                      href="/integrations"
                      aria-label="Open integrations"
                      title="Integrations"
                      className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[rgba(120,145,255,0.18)] bg-[rgba(255,255,255,0.04)] text-[var(--accent)] transition hover:border-[rgba(108,242,255,0.35)] hover:bg-[rgba(108,242,255,0.08)]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                        <path d="M7 7h10v10H7z" />
                        <path d="M4 12h3" />
                        <path d="M17 12h3" />
                        <path d="M12 4v3" />
                        <path d="M12 17v3" />
                      </svg>
                    </Link>
                  </div>
                )}
              </div>

              <div className={`mt-4 space-y-3 rounded-[24px] border border-[rgba(120,145,255,0.14)] bg-[rgba(255,255,255,0.03)] ${isSidebarExpanded ? "p-3" : "px-2 py-3"}`}>
                {user ? (
                  <>
                    <div className="rounded-2xl border border-[rgba(120,145,255,0.2)] bg-[linear-gradient(135deg,rgba(30,123,255,0.14)_0%,rgba(143,56,255,0.12)_65%,rgba(255,180,0,0.08)_100%)] p-3">
                      <div className={`flex ${isSidebarExpanded ? "items-start gap-3" : "justify-center"}`}>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-strong)_100%)] text-sm font-bold text-white shadow-[0_10px_24px_-16px_rgba(30,123,255,0.8)]">
                          {getUserInitials(user.email)}
                        </div>
                        {isSidebarExpanded && (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                  {getUserDisplayName(user.email)}
                                </p>
                                <p className="truncate text-xs text-[var(--text-secondary)]">{user.email}</p>
                              </div>
                              <span className="rounded-full border border-[rgba(56,255,179,0.28)] bg-[rgba(56,255,179,0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--success)]">
                                Live
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-xl border border-[rgba(120,145,255,0.18)] bg-[rgba(6,10,26,0.35)] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Role</p>
                                <p className="mt-1 text-xs font-semibold uppercase text-[var(--text-primary)]">{user.role}</p>
                              </div>
                              <div className="rounded-xl border border-[rgba(120,145,255,0.18)] bg-[rgba(6,10,26,0.35)] px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">User ID</p>
                                <p className="mt-1 truncate text-xs font-semibold text-[var(--text-primary)]">
                                  {user.id.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className={`w-full rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] ${
                        isSidebarExpanded ? "" : "px-0"
                      }`}
                    >
                      {isSidebarExpanded ? "Logout" : "Out"}
                    </button>
                  </>
                ) : !isLoading ? (
                  <Link
                    href="/login"
                    className="block rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-center text-sm font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  >
                    Login
                  </Link>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">{isSidebarExpanded ? "Loading user..." : "..."}</p>
                )}
              </div>
            </div>
          </motion.aside>
        )}

        <div className={`min-w-0 flex-1 ${showSidebar ? "lg:pl-4" : ""}`}>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
