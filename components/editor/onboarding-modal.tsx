"use client";

import { useState } from "react";

export default function OnboardingModal({
  isOpen,
  onSubmit,
}: {
  isOpen: boolean;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    await onSubmit(name);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg border-brutal-thick bg-card p-8 shadow-brutal-lg">
        <h2 className="text-3xl font-black uppercase mb-4">WELCOME TO Luman</h2>
        <p className="font-bold uppercase mb-8 border-l-4 border-foreground pl-4">
          TO GET STARTED, YOU NEED TO CREATE YOUR FIRST WORKSPACE.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-black uppercase">WORKSPACE NAME</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border-brutal bg-background px-4 py-3 font-bold uppercase focus:outline-none focus:ring-2 focus:ring-foreground"
              placeholder="MY AWESOME WORKSPACE"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full border-brutal bg-foreground py-4 text-xl font-black uppercase text-background hover:bg-accent hover:text-accent-foreground transition-all disabled:opacity-50"
          >
            {submitting ? "CREATING..." : "CREATE WORKSPACE"}
          </button>
        </form>
      </div>
    </div>
  );
}
