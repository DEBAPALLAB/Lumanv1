"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { validate as uuidValidate } from "uuid";

export default function NewNotePage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [loading, setLoading] = useState(false);
  const [customTitle, setCustomTitle] = useState("");

  async function createNote(e: React.FormEvent) {
    e.preventDefault();

    // ✅ Validate FIRST
    if (!workspaceId || !uuidValidate(workspaceId)) {
      alert("Invalid workspace ID");
      return;
    }

    if (!customTitle.trim()) {
      alert("Please enter a note title");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: customTitle.trim(),
          templateType: "Custom",
        }),
      });

      if (!res.ok) {
        let errMsg = "Failed to create note";
        try {
          const text = await res.text();
          const errData = text ? JSON.parse(text) : null;
          if (errData?.error) errMsg = errData.error;
          console.error("CREATE NOTE FAILED:", errData || text);
        } catch (e) {
          console.error("CREATE NOTE FAILED: Error reading error response", e);
        }
        alert(`Failed to create note: ${errMsg}`);
        return;
      }

      // ✅ SAFE JSON PARSE (NO CRASH)
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!data?.id) {
        console.error("CREATE NOTE: Missing ID", data);
        alert("Failed to create note");
        return;
      }

      router.push(`/workspace/${workspaceId}/note/${data.id}`);
    } catch (err) {
      console.error("createNote crashed:", err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">New Note</h1>
      </div>

      <form onSubmit={createNote} className="space-y-4">
        <div>
          <label htmlFor="noteTitle" className="block text-sm font-medium mb-2">
            Note Title
          </label>
          <input
            id="noteTitle"
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Enter your note title..."
            disabled={loading}
            className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={loading || !customTitle.trim()}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? "Creating..." : "Create Note"}
        </button>
      </form>
    </div>
  );
}
