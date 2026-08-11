"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
  ChevronRight,
  Home,
  Folder,
  FileText,
  Calendar,
  CheckSquare,
  Settings,
  Shield,
  Sun,
  Moon,
  Laptop,
} from "lucide-react";

export function FloatingDock() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();

  const workspaceId = params?.workspaceId as string;
  const noteId = params?.noteId as string;
  const orgSlug =
    searchParams.get("org") || (typeof window !== "undefined" ? sessionStorage.getItem("selected_org_slug") : "") || "";

  const [workspaceName, setWorkspaceName] = useState("");
  const [noteTitle, setNoteTitle] = useState("");

  const { theme, setTheme } = useTheme();

  // Fetch Workspace name
  useEffect(() => {
    if (!workspaceId) {
      setWorkspaceName("");
      return;
    }
    const supabase = createSupabaseClient();
    async function getWorkspace() {
      try {
        const { data, error } = await supabase
          .from("workspaces")
          .select("owner_name")
          .eq("id", workspaceId)
          .maybeSingle();
        if (error) {
          console.error("Dock fetch workspace error:", error);
          return;
        }
        if (data && data.owner_name) {
          setWorkspaceName(data.owner_name);
        }
      } catch (err) {
        console.error("Dock fetch workspace error:", err);
      }
    }
    getWorkspace();
  }, [workspaceId]);

  // Fetch Note title
  useEffect(() => {
    if (!noteId) {
      setNoteTitle("");
      return;
    }
    fetch(`/api/notes/${noteId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.title) {
          setNoteTitle(data.title);
        }
      })
      .catch((err) => console.error("Dock fetch note error:", err));
  }, [noteId]);

  const orgQueryParam = orgSlug ? `?org=${orgSlug}` : "";
  const dashboardUrl = `/dashboard${orgQueryParam}`;

  // Build the items based on current pathname
  const items = [];

  // 1. Home / Dashboard (Always present)
  items.push({
    label: "Home",
    icon: Home,
    href: dashboardUrl,
  });

  // 2. Resolve intermediate pages or workspaces
  if (pathname?.startsWith("/calendar")) {
    items.push({
      label: "Calendar",
      icon: Calendar,
      href: `/calendar${orgQueryParam}`,
    });
  } else if (pathname?.startsWith("/dashboard/tasks")) {
    items.push({
      label: "My Tasks",
      icon: CheckSquare,
      href: `/dashboard/tasks${orgQueryParam}`,
    });
  } else if (pathname?.startsWith("/settings")) {
    items.push({
      label: "Settings",
      icon: Settings,
      href: `/settings${orgQueryParam}`,
    });
  } else if (pathname?.startsWith("/dashboard/admin")) {
    items.push({
      label: "Admin Panel",
      icon: Shield,
      href: `/dashboard/admin${orgQueryParam}`,
    });
  } else if (workspaceId) {
    items.push({
      label: workspaceName || "Workspace",
      icon: Folder,
      href: `/workspace/${workspaceId}${orgQueryParam}`,
    });

    if (noteId) {
      items.push({
        label: noteTitle || "Note",
        icon: FileText,
        href: `/workspace/${workspaceId}/note/${noteId}${orgQueryParam}`,
      });
    }
  }

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="pointer-events-auto group flex items-center gap-2 h-14 px-5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-[3px] border-black dark:border-stone-100 rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-y-[2px] transition-all duration-300">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isLast = index === items.length - 1;

          return (
            <div key={item.label} className="flex items-center">
              <Link
                href={item.href}
                className="flex items-center gap-0 hover:text-[#FBBF24] transition-colors"
              >
                <Icon className="h-4.5 w-4.5 shrink-0 text-black dark:text-stone-100" />
                <span className="max-w-0 opacity-0 group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-out overflow-hidden whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-black dark:text-stone-100">
                  {item.label}
                </span>
              </Link>

              {!isLast && (
                <ChevronRight className="h-4 w-4 mx-1.5 text-stone-400 dark:text-stone-600 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
