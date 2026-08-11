"use client";

import { X, Sparkles, Folder, Palette, Eye, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface WorkspaceFolder {
  id: string;
  name: string;
}

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentName: string;
  currentColor: string;
  currentFolderId: string | null;
  currentRole: string;
  orgId: string | null;
  ownerId: string | null;
  createdBy: string | null;
  sessionUser: {
    userId: string;
    role: string;
  } | null;
  onSaveSuccess?: () => void;
}

export function WorkspaceSettingsModal({
  isOpen,
  onClose,
  workspaceId,
  currentName,
  currentColor,
  currentFolderId,
  currentRole,
  orgId,
  ownerId,
  createdBy,
  sessionUser,
  onSaveSuccess,
}: WorkspaceSettingsModalProps) {
  const [name, setName] = useState(currentName);
  const [color, setColor] = useState(currentColor);
  const [folderId, setFolderId] = useState<string | null>(currentFolderId);
  const [role, setRole] = useState(currentRole);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(currentName);
    setColor(currentColor);
    setFolderId(currentFolderId);
    setRole(currentRole);
  }, [currentName, currentColor, currentFolderId, currentRole, isOpen]);

  useEffect(() => {
    if (!isOpen || !orgId) return;

    async function loadFolders() {
      try {
        setLoading(true);
        const res = await fetch(`/api/folders?orgId=${orgId}`);
        if (res.ok) {
          const data = await res.json();
          setFolders(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load folders for settings modal:", err);
      } finally {
        setLoading(false);
      }
    }

    loadFolders();
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  const isFounder = sessionUser?.role === "founder";
  const isOwnerOrCreate = sessionUser?.userId === ownerId || sessionUser?.userId === createdBy;
  
  const canEditFolderAndAccent = isFounder || isOwnerOrCreate;
  const canEditVisibility = isOwnerOrCreate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      alert("Workspace name cannot be empty");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/workspaces?id=${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          color,
          folderId,
          role,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to update workspace settings");
        return;
      }

      window.dispatchEvent(new CustomEvent("luman-workspaces-refresh"));
      onSaveSuccess?.();
      onClose();
    } catch (err) {
      console.error("Error saving workspace settings:", err);
      alert("Error saving workspace settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 font-sans">
      <div className="bg-[#FDFBF7] dark:bg-zinc-900 border-brutal-thick shadow-brutal-xl max-w-xl w-full max-h-[90vh] overflow-y-auto text-black dark:text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b-4 border-black dark:border-stone-100 bg-[#FBBF24]">
          <div className="flex items-center gap-3 text-black">
            <Settings className="h-7 w-7" />
            <h2 className="text-2xl font-black uppercase tracking-wide">WORKSPACE SETTINGS</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 border-[3px] border-black hover:bg-black/10 bg-white text-black transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Workspace Name */}
          <div className="space-y-2">
            <label htmlFor="wsName" className="block text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Workspace Name *
            </label>
            <input
              id="wsName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!canEditFolderAndAccent}
              placeholder="ENTER WORKSPACE NAME..."
              className="w-full border-[3px] border-black dark:border-stone-100 px-5 py-3.5 text-base font-bold uppercase bg-white dark:bg-zinc-800 text-black dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Folder Selection */}
            <div className="space-y-2">
              <label htmlFor="wsFolder" className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <Folder className="h-3.5 w-3.5" />
                Folder
              </label>
              <select
                id="wsFolder"
                value={folderId || ""}
                disabled={loading || !canEditFolderAndAccent}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="w-full border-[3px] border-black dark:border-stone-100 px-4 py-3 text-sm font-black uppercase bg-white dark:bg-zinc-800 text-black dark:text-stone-100 focus:outline-none cursor-pointer disabled:opacity-60"
              >
                <option value="">None</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Accent Selection */}
            <div className="space-y-2">
              <label htmlFor="wsAccent" className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <Palette className="h-3.5 w-3.5" />
                Accent
              </label>
              <select
                id="wsAccent"
                value={color}
                disabled={!canEditFolderAndAccent}
                onChange={(e) => setColor(e.target.value)}
                className="w-full border-[3px] border-black dark:border-stone-100 px-4 py-3 text-sm font-black uppercase bg-white dark:bg-zinc-800 text-black dark:text-stone-100 focus:outline-none cursor-pointer disabled:opacity-60"
              >
                <option value="stone">Gray</option>
                <option value="red">Red</option>
                <option value="blue">Blue</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="purple">Purple</option>
                <option value="pink">Pink</option>
                <option value="orange">Orange</option>
              </select>
            </div>

            {/* Visibility Selection */}
            <div className="space-y-2">
              <label htmlFor="wsVisibility" className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <Eye className="h-3.5 w-3.5" />
                Visibility
              </label>
              <select
                id="wsVisibility"
                value={role}
                disabled={!canEditVisibility}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border-[3px] border-black dark:border-stone-100 px-4 py-3 text-sm font-black uppercase bg-white dark:bg-zinc-800 text-black dark:text-stone-100 focus:outline-none cursor-pointer disabled:opacity-60"
                title={!canEditVisibility ? "Only the workspace creator can modify visibility." : ""}
              >
                <option value="intern">Visible to All</option>
                <option value="admin">Admin & Founder</option>
                <option value="founder">Founder Only</option>
              </select>
            </div>
          </div>

          {!canEditFolderAndAccent && (
            <p className="text-[11px] font-bold text-red-500 uppercase tracking-wide">
              Only the creator or a founder of this organization has permission to modify this workspace's configurations.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t-2 border-stone-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3.5 text-sm font-black uppercase border-[3px] border-black dark:border-stone-100 bg-white dark:bg-zinc-800 text-black dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-zinc-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={saving || !canEditFolderAndAccent}
              className="flex-1 px-6 py-3.5 text-sm font-black uppercase border-[3px] border-black dark:border-stone-100 bg-[#FBBF24] text-black hover:bg-[#FBBF24]/90 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-none"
            >
              {saving ? "SAVING..." : "SAVE CHANGES"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
