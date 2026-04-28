"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Active workspace exposed to client components.
 *
 * Populated by `[slug]/layout.tsx` once the slug + membership have been
 * validated server-side. Components that build links (sidebar, header,
 * intra-app navigation) read `slug` from here so URLs stay correct
 * across workspace switches.
 */
interface WorkspaceContextValue {
  slug: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  email: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  slug,
  name,
  role,
  email,
  children,
}: WorkspaceContextValue & { children: ReactNode }) {
  return (
    <WorkspaceContext.Provider value={{ slug, name, role, email }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a <WorkspaceProvider>");
  }
  return ctx;
}
