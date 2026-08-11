"use client";

import AIChatSidebar from "@/components/editor/ai-chat-sidebar";
import { EventModal } from "@/components/calendar/event-modal";
import { TagSelector } from "@/components/editor/tag-selector";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, MessageSquare, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";

import AppShell from "@/components/layouts/app-shell";
const TailwindAdvancedEditor = dynamic(() => import("@/components/editor/advanced-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
    </div>
  ),
});
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function NoteEditorPage() {
  const { noteId, workspaceId } = useParams<{
    workspaceId: string;
    noteId: string;
  }>();

  const router = useRouter();
  const [content, setContent] = useState<any>(null);
  const [title, setTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventCreatedMessage, setEventCreatedMessage] = useState<string | null>(null);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [chatWidth, setChatWidth] = useState(420);

  // Note visibility state
  const [visibilityMode, setVisibilityMode] = useState<"public" | "hierarchy" | "specific">("public");
  const [minRoleLevel, setMinRoleLevel] = useState<number | null>(null);
  const [specificRoleIds, setSpecificRoleIds] = useState<string[]>([]);
  const [userRoleLevel, setUserRoleLevel] = useState<number | null>(null);
  const [userRoleId, setUserRoleId] = useState<string | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Set default chat width based on viewport on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setChatWidth(360);
    }
  }, []);

  // Sync isNotesCollapsed state when toggle is triggered elsewhere
  useEffect(() => {
    const handleToggle = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (typeof customEvent.detail === "boolean") {
        setIsNotesCollapsed(customEvent.detail);
      }
    };
    window.addEventListener("luman-toggle-notes-sidebar", handleToggle);
    return () => window.removeEventListener("luman-toggle-notes-sidebar", handleToggle);
  }, []);

  // Collapse notes drawer automatically when AI chat opens
  useEffect(() => {
    if (isChatOpen) {
      setIsNotesCollapsed(true);
      window.dispatchEvent(new CustomEvent("luman-toggle-notes-sidebar", { detail: true }));
    }
  }, [isChatOpen]);

  // Live stats and dynamic outline
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [headings, setHeadings] = useState<{ text: string; level: number }[]>([]);

  useEffect(() => {
    async function loadNote() {
      try {
        const res = await fetch(`/api/notes/${noteId}`);
        const data = await res.json();

        if (!data?.content) {
          setContent({ type: "doc", content: [] });
        } else {
          setContent(data.content);
        }

        setTitle(data?.title || "Untitled");
        setTags(data?.tags || []);
        setVisibilityMode(data?.visibility_mode || "public");
        setMinRoleLevel(data?.minimum_visible_role_level ?? null);
        setSpecificRoleIds(data?.specific_role_ids || []);

        const supabase = createSupabaseClient();
        const { data: wsData } = await supabase
          .from("workspaces")
          .select("organization_id")
          .eq("id", workspaceId)
          .single();

        if (wsData?.organization_id) {
          setOrgId(wsData.organization_id);

          const rolesRes = await fetch(`/api/organization/${wsData.organization_id}/roles`);
          if (rolesRes.ok) {
            const rolesData = await rolesRes.json();
            setRoles(rolesData || []);
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: member } = await supabase
              .from("organization_members")
              .select("assigned_role_id, roles(hierarchy_level)")
              .eq("organization_id", wsData.organization_id)
              .eq("user_id", user.id)
              .single();

            if (member) {
              setUserRoleId(member.assigned_role_id);
              const r = member.roles as any;
              setUserRoleLevel(r?.hierarchy_level ?? null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load note data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadNote();
  }, [noteId, workspaceId]);

  const handleUpdateVisibility = async (
    mode: "public" | "hierarchy" | "specific",
    minLevel: number | null,
    roleIds: string[]
  ) => {
    setVisibilityMode(mode);
    setMinRoleLevel(minLevel);
    setSpecificRoleIds(roleIds);

    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibilityMode: mode,
          minimumVisibleRoleLevel: minLevel,
          specificRoleIds: roleIds,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to update visibility settings");
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to update note visibility:", err);
    }
  };



  // Bind statistics change listener & outline heading parser to editorInstance
  useEffect(() => {
    if (!editorInstance) return;

    const updateStatsAndOutline = () => {
      // 1. Live stats
      if (editorInstance.storage?.characterCount) {
        setWordCount(editorInstance.storage.characterCount.words() || 0);
        setCharCount(editorInstance.storage.characterCount.characters() || 0);
      } else {
        const text = editorInstance.getText() || "";
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        setWordCount(words);
        setCharCount(text.length);
      }

      // 2. Headings for Table of Contents
      const json = editorInstance.getJSON();
      const extracted: { text: string; level: number }[] = [];
      const traverse = (node: any) => {
        if (node.type === "heading" && node.content?.[0]?.text) {
          extracted.push({
            text: node.content[0].text,
            level: node.attrs?.level || 1,
          });
        }
        if (node.content) {
          node.content.forEach(traverse);
        }
      };
      traverse(json);
      setHeadings(extracted);
    };

    // Initialize counts & headings on editor mount
    updateStatsAndOutline();

    // Listen for real-time keystrokes
    editorInstance.on("update", updateStatsAndOutline);

    return () => {
      editorInstance.off("update", updateStatsAndOutline);
    };
  }, [editorInstance]);

  // Clickable TOC scrolling logic with highlighted visual pulse
  const scrollToHeading = (index: number) => {
    const editorDom = document.querySelector(".tiptap, [contenteditable='true']");
    if (!editorDom) return;

    const headingElements = editorDom.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const targetElement = headingElements[index];

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

      // Temporary neobrutalist highlighting pulse
      targetElement.classList.add("bg-[#FEF08A]", "transition-all", "duration-500", "ring-4", "ring-black", "rounded-lg");
      setTimeout(() => {
        targetElement.classList.remove("bg-[#FEF08A]", "ring-4", "ring-black", "rounded-lg");
      }, 1500);
    }
  };

  // Listen for /schedule slash command
  useEffect(() => {
    const handleOpenEventModal = () => {
      setIsEventModalOpen(true);
    };

    window.addEventListener("open-event-modal", handleOpenEventModal);
    return () => window.removeEventListener("open-event-modal", handleOpenEventModal);
  }, []);

  // Dispatch stats updates to Left Sidebar (WorkspaceSidebar)
  useEffect(() => {
    if (loading) return;
    const detail = {
      headings,
      wordCount,
      charCount,
      noteId
    };
    const event = new CustomEvent("luman-note-editor-update", { detail });
    window.dispatchEvent(event);
  }, [headings, wordCount, charCount, noteId, loading]);

  // Listen for scroll, HTML and Text export custom events from left sidebar
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index;
      if (typeof idx === "number") {
        scrollToHeading(idx);
      }
    };

    const handleHtmlExport = () => {
      if (!editorInstance) return;
      const html = editorInstance.getHTML();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.html`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleTextExport = () => {
      if (!editorInstance) return;
      const text = editorInstance.getText();
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };

    window.addEventListener("luman-scroll-to-heading", handleScroll);
    window.addEventListener("luman-trigger-html-export", handleHtmlExport);
    window.addEventListener("luman-trigger-text-export", handleTextExport);

    return () => {
      window.removeEventListener("luman-scroll-to-heading", handleScroll);
      window.removeEventListener("luman-trigger-html-export", handleHtmlExport);
      window.removeEventListener("luman-trigger-text-export", handleTextExport);
    };
  }, [editorInstance, title]);

  const handleTagsChange = async (newTags: string[]) => {
    setTags(newTags);
    try {
      await fetch(`/api/notes/${noteId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
    } catch (error) {
      console.error("Failed to update tags:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FDFBF7] dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[#FBBF24]" />
          <p className="text-xs font-black uppercase tracking-widest text-stone-500">Loading note...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="relative h-full flex flex-col bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/5 blur-[120px] dark:opacity-20 animate-pulse z-0" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-purple-500/5 blur-[120px] dark:opacity-20 animate-pulse z-0" />

        {/* Split Body Layout */}
        <div className="flex-1 flex overflow-hidden relative z-10 w-full">

          {/* Middle Main Content Area (The Editor scroll container) */}
          <main className="flex-1 overflow-y-auto scrollbar-none px-4 pt-24 pb-6 md:px-8 md:pt-28 md:pb-8 lg:px-10 lg:pt-32 lg:pb-10 xl:px-12 relative">
            <div className="max-w-6xl mx-auto border-[3px] border-black dark:border-stone-100 rounded-[24px] bg-white dark:bg-zinc-900 p-5 sm:p-8 md:p-10 xl:p-12 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[10px_10px_0px_0px_rgba(255,255,255,1)] transition-all">

              {/* Document Header Panel */}
              <div className="border-b-[3px] border-black dark:border-stone-100 pb-6 mb-6 space-y-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={async () => {
                    try {
                      await fetch(`/api/notes/${noteId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title }),
                      });
                    } catch (err) {
                      console.error("Failed to update note title:", err);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  className="w-full bg-transparent text-2xl sm:text-3xl xl:text-4xl font-black uppercase text-black dark:text-stone-100 focus:outline-none placeholder:text-stone-300 dark:placeholder:text-stone-700"
                  placeholder="UNTITLED NOTE"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3.5 py-1.5 text-xs font-black uppercase border-2 border-black dark:border-stone-100 bg-[#FBBF24] text-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,1)] rounded-full select-none">
                    Note Document
                  </span>
                  <TagSelector tags={tags} onChange={handleTagsChange} />
                </div>
              </div>

              <TailwindAdvancedEditor
                key={noteId}
                noteId={noteId}
                workspaceId={workspaceId}
                initialContent={content}
                onEditorReady={setEditorInstance}
              />
            </div>
          </main>

          {/* AI Chat Sidebar (Inline Flex Panel) */}
          <AIChatSidebar
            noteId={noteId}
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            onInsert={(text) => {
              if (editorInstance) {
                editorInstance.chain().focus().insertContent(text).run();
              }
            }}
            width={chatWidth}
            setWidth={setChatWidth}
          />
        </div>


        {/* Floating AI Chat Toggle Button */}
        <button
          type="button"
          onClick={() => setIsChatOpen(!isChatOpen)}
          style={{ right: isChatOpen ? `${chatWidth + 24}px` : "24px" }}
          className={cn(
            "fixed top-[84px] z-40 flex items-center justify-center h-12 w-12 rounded-full border-[3px] border-black hover:-translate-y-0.5 transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] active:shadow-none hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]",
            isChatOpen
              ? "bg-[#FBBF24] text-black"
              : "bg-white dark:bg-zinc-900 text-black dark:text-stone-100"
          )}
          title={isChatOpen ? "Close AI Assistant" : "Open AI Assistant"}
        >
          {isChatOpen ? (
            <ChevronRight className="h-6 w-6" />
          ) : (
            <ChevronLeft className="h-6 w-6 animate-pulse" />
          )}
          {!isChatOpen && (
            <span className="absolute -top-1.5 -left-1.5 h-4.5 w-4.5 bg-black rounded-full text-[8px] font-black flex items-center justify-center text-[#FBBF24] ring-2 ring-black">
              AI
            </span>
          )}
        </button>

        {/* Event Modal */}
        <EventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          workspaceId={workspaceId}
          noteId={noteId}
          onEventCreated={() => {
            setEventCreatedMessage("✅ Event scheduled successfully!");
            setTimeout(() => setEventCreatedMessage(null), 4000);
          }}
        />

        {/* Event Created Notification */}
        {eventCreatedMessage && (
          <div className="fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom-4">
            <div className="border-[3px] border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] bg-[#A7F3D0] text-black px-8 py-4 font-black uppercase text-lg rounded-2xl">
              {eventCreatedMessage}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
