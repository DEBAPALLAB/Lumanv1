"use client";

import AppShell from "@/components/layouts/app-shell";
import { NoteModal } from "@/components/editor/note-modal";
import { WorkspaceSettingsModal } from "@/components/dashboard/workspace-settings-modal";
import { createSupabaseClient } from "@/lib/supabase/client";
import { ArrowRight, Clock3, FileText, Plus, Search, Sparkles, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

type Note = {
  id: string;
  title: string;
  created_at: string;
  tags?: string[];
};

type Workspace = {
  owner_name: string;
  color?: string | null;
  role?: string | null;
  owner_id?: string | null;
  created_by?: string | null;
  organization_id?: string | null;
  folder_id?: string | null;
};

function WorkspaceContent() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org") || "";
  const router = useRouter();

  const [notes, setNotes] = useState<Note[]>([]);
  const [_loading, setLoading] = useState(true);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionUser, setSessionUser] = useState<{ userId: string; role: string } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      try {
        const supabase = createSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          router.push(`/login${orgSlug ? `?org=${orgSlug}` : ""}`);
          return;
        }

        const [notesRes, workspaceRes, sessionRes] = await Promise.all([
          fetch(`/api/notes?workspaceId=${workspaceId}`),
          supabase.from("workspaces").select("owner_name, color, role, owner_id, created_by, organization_id, folder_id").eq("id", workspaceId).single(),
          fetch(`/api/auth/session${orgSlug ? `?org=${orgSlug}` : ""}`),
        ]);

        const notesData = await notesRes.json();
        const ws = workspaceRes.data;
        const sessionData = sessionRes.ok ? await sessionRes.json() : null;
        const userRole = sessionData?.user?.role || "intern";

        if (sessionData?.user) {
          setSessionUser({
            userId: sessionData.user.userId,
            role: sessionData.user.role,
          });
        }

        if (!active) return;

        if (ws) {
          const isRestricted =
            (user.id !== ws.owner_id && user.id !== ws.created_by) &&
            ((ws.role === "founder" && userRole !== "founder") ||
             (ws.role === "admin" && userRole === "intern"));

          if (isRestricted) {
            alert("You do not have permission to access this restricted workspace.");
            router.push(`/dashboard${orgSlug ? `?org=${orgSlug}` : ""}`);
            return;
          }
        }

        setNotes(Array.isArray(notesData) ? notesData : []);
        setWorkspace(ws ?? null);
      } catch (err) {
        console.error("Failed to load workspace notes:", err);
        if (active) setNotes([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadWorkspace();

    return () => {
      active = false;
    };
  }, [workspaceId, router, orgSlug]);

  const filteredNotes = notes.filter((note) => {
    if (!searchQuery.trim()) return true;
    const haystack = `${note.title} ${(note.tags || []).join(" ")}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase());
  });

  const noteCount = notes.length;
  const latestNote = notes[0];
  const workspaceName = workspace?.owner_name || "Workspace";
  const workspaceTone = workspace?.color || "yellow";

  return (
    <AppShell>
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20" />

        <div className="relative mx-auto max-w-5xl px-4 pt-2 pb-6 md:px-8 md:pt-3 md:pb-8 lg:px-10 lg:pt-4 lg:pb-10">
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-black uppercase tracking-[0.25em] border-[3px] border-black bg-[#FBBF24] text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-full">
                <Sparkles className="h-4 w-4 animate-pulse" />
                Workspace Notes
              </span>
              <span
                className={`px-3.5 py-1.5 text-xs font-black uppercase tracking-widest border-[3px] border-black text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-full ${
                  workspaceTone === "yellow" ? "bg-[#FEF08A]" : "bg-white"
                }`}
              >
                {workspaceName}
              </span>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-black uppercase leading-[0.9] tracking-tight">Notes</h1>
              <p className="max-w-2xl text-base md:text-lg font-semibold uppercase leading-7 opacity-75">
                Build, sort, and jump between notes in this workspace without losing the big picture.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(true)}
                className="inline-flex items-center justify-center gap-3 px-8 py-4 text-base md:text-lg font-black uppercase border-[3px] border-black rounded-full bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                <Plus className="h-5 w-5" />
                New note
              </button>

              {sessionUser && (sessionUser.role === "founder" || sessionUser.userId === workspace?.owner_id || sessionUser.userId === workspace?.created_by) && (
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 text-base md:text-lg font-black uppercase border-[3px] border-black rounded-full bg-white hover:bg-stone-50 text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all animate-none"
                  title="Workspace Settings"
                >
                  <Settings className="h-5 w-5 transition-none animate-none" style={{ transition: "none", transform: "none" }} />
                  Settings
                </button>
              )}

              <div className="flex-1 min-w-0 border-[3px] border-black bg-white rounded-full px-5 py-3.5 flex items-center gap-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <Search className="h-5 w-5 shrink-0 text-stone-500" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search titles or tags..."
                  className="w-full bg-transparent text-sm md:text-base font-bold uppercase placeholder:font-bold placeholder:uppercase focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm font-black uppercase tracking-widest opacity-70">
              Showing {filteredNotes.length} of {notes.length} notes
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredNotes.map((note, index) => (
              <div
                key={note.id}
                className="group relative overflow-hidden border-[3px] border-black bg-white rounded-[24px] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all flex flex-col justify-between p-6 md:p-8"
              >
                <div className="absolute inset-x-0 top-0 h-2 bg-accent" />
                <div className="absolute -right-10 top-10 h-24 w-24 rounded-full bg-accent/15 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
                <Link href={`/workspace/${workspaceId}/note/${note.id}${orgSlug ? `?org=${orgSlug}` : ""}`} className="block">
                  <div className="space-y-5 relative">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] border-brutal bg-background">
                        <FileText className="h-3.5 w-3.5" />
                        Note {String(index + 1).padStart(2, "0")}
                      </span>
                      {note.tags && note.tags.length > 0 && (
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">
                          {note.tags.length} tags
                        </span>
                      )}
                    </div>

                    <div className="text-2xl md:text-3xl font-black uppercase leading-tight line-clamp-3">
                      {note.title}
                    </div>

                    {note.tags && note.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {note.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="px-3 py-1 text-[11px] font-black uppercase border-brutal-sm bg-muted/50"
                          >
                            {tag}
                          </span>
                        ))}
                        {note.tags.length > 4 && (
                          <span className="px-3 py-1 text-[11px] font-black uppercase border-brutal-sm bg-background">
                            +{note.tags.length - 4}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm font-bold uppercase opacity-50">No tags yet</div>
                    )}

                    <div className="flex items-center gap-2 pt-4 border-t-4 border-foreground text-sm font-black uppercase">
                      <span>Open</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>

                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const ok = confirm("DELETE THIS NOTE?");
                    if (!ok) return;

                    await fetch(`/api/notes/${note.id}`, {
                      method: "DELETE",
                    });

                    setNotes((prev) => prev.filter((n) => n.id !== note.id));
                  }}
                  type="button"
                  className="absolute top-4 right-4 inline-flex items-center gap-2 px-3 py-2 text-xs font-black uppercase border-brutal bg-background text-destructive hover-brutal"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Note Modal */}
      <NoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        workspaceId={workspaceId}
        onNoteCreated={async () => {
          const res = await fetch(`/api/notes?workspaceId=${workspaceId}`);
          const data = await res.json();
          setNotes(Array.isArray(data) ? data : []);
        }}
      />

      {/* Workspace Settings Modal */}
      {workspace && (
        <WorkspaceSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          workspaceId={workspaceId}
          currentName={workspace.owner_name}
          currentColor={workspace.color || "stone"}
          currentFolderId={workspace.folder_id || null}
          currentRole={workspace.role || "intern"}
          orgId={workspace.organization_id || null}
          ownerId={workspace.owner_id || null}
          createdBy={workspace.created_by || null}
          sessionUser={sessionUser}
          onSaveSuccess={async () => {
            try {
              const supabase = createSupabaseClient();
              const { data: ws } = await supabase
                .from("workspaces")
                .select("owner_name, color, role, owner_id, created_by, organization_id, folder_id")
                .eq("id", workspaceId)
                .single();
              if (ws) setWorkspace(ws);
            } catch (err) {
              console.error("Failed to reload workspace details:", err);
            }
          }}
        />
      )}
    </AppShell>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>}>
      <WorkspaceContent />
    </Suspense>
  );
}
