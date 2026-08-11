"use client";

import { Hash, Plus, X } from "lucide-react";
import { useState } from "react";

interface TagSelectorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  readonly?: boolean;
}

export function TagSelector({ tags = [], onChange, readonly = false }: TagSelectorProps) {
  const [input, setInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Ensure tags is always an array
  const currentTags = Array.isArray(tags) ? tags : [];

  const handleAddTag = (e?: React.FormEvent) => {
    e?.preventDefault();
    const tag = input.trim();
    if (tag && !currentTags.includes(tag)) {
      onChange([...currentTags, tag]);
      setInput("");
      setIsAdding(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(currentTags.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setIsAdding(false);
    }
  };

  const getTagColor = (tag: string) => {
    const colors = [
      "bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-300",
      "bg-blue-100 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300",
      "bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-300",
      "bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300",
      "bg-purple-100 text-purple-700 dark:bg-purple-950/20 dark:text-purple-300",
      "bg-pink-100 text-pink-700 dark:bg-pink-950/20 dark:text-pink-300",
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300",
      "bg-teal-100 text-teal-700 dark:bg-teal-950/20 dark:text-teal-300",
    ];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentTags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${getTagColor(tag)}`}
        >
          <Hash className="h-3 w-3 opacity-50" />
          {tag}
          {!readonly && (
            <button
              onClick={() => handleRemoveTag(tag)}
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Remove {tag}</span>
            </button>
          )}
        </span>
      ))}

      {!readonly && (
        <>
          {isAdding ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => handleAddTag()}
                autoFocus
                className="h-6 w-24 rounded-md border text-xs px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="New tag..."
              />
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition"
            >
              <Plus className="h-3 w-3" />
              Add Tag
            </button>
          )}
        </>
      )}
    </div>
  );
}
