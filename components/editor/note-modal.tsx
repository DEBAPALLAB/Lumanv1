"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onNoteCreated?: () => void;
}

export function NoteModal({ isOpen, onClose, workspaceId, onNoteCreated }: NoteModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      alert("Please enter a note title");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: title.trim(),
          templateType: "Custom",
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to create note";
        try {
          const text = await res.text();
          const errData = text ? JSON.parse(text) : null;
          if (errData?.error) errMsg = errData.error;
        } catch (e) {
          console.error("Error reading/parsing note error response", e);
        }
        alert(`Failed to create note: ${errMsg}`);
        return;
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!data?.id) {
        alert("Failed to create note");
        return;
      }

      onNoteCreated?.();
      handleClose();
      router.push(`/workspace/${workspaceId}/note/${data.id}`);
    } catch (error) {
      console.error("Error creating note:", error);
      alert("Error creating note");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setTitle("");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background border-brutal-thick shadow-brutal-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b-4 border-foreground">
          <h2 className="text-3xl font-black uppercase">CREATE NOTE</h2>
          <button type="button" onClick={handleClose} className="p-3 border-brutal hover-brutal bg-background">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Title */}
          <div className="space-y-3">
            <label htmlFor="noteTitle" className="block text-sm font-black uppercase tracking-wider">
              NOTE TITLE *
            </label>
            <input
              id="noteTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="ENTER YOUR NOTE TITLE..."
              className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background placeholder:text-muted-foreground placeholder:font-bold focus:outline-none focus:shadow-brutal"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-8 py-4 text-lg font-black uppercase border-brutal hover-brutal bg-background"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex-1 px-8 py-4 text-lg font-black uppercase border-brutal hover-brutal bg-accent text-accent-foreground disabled:opacity-50"
            >
              {loading ? "CREATING..." : "CREATE NOTE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
