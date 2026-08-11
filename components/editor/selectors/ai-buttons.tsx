import { Button } from "@/components/ui/button";
import { Pencil, Sparkles } from "lucide-react";
import { EditorBubbleItem, useEditor } from "@/components/editor/headless";

export const AIButtons = () => {
  const { editor } = useEditor();
  if (!editor) return null;

  const handleExplain = () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to);

    if (text) {
      // Dispatch custom event for AI chat
      window.dispatchEvent(
        new CustomEvent("ai-chat-trigger", {
          detail: { action: "explain", text },
        }),
      );
    }
  };

  const handleFixGrammar = () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to);

    if (text) {
      // Dispatch custom event for AI chat
      window.dispatchEvent(
        new CustomEvent("ai-chat-trigger", {
          detail: { action: "fix", text },
        }),
      );
    }
  };

  return (
    <div className="flex border-l border-border/50 ml-2 pl-2">
      <EditorBubbleItem onSelect={handleExplain}>
        <Button
          size="sm"
          className="rounded-none"
          variant="ghost"
          type="button"
          title="Ask AI to explain selected text"
        >
          <Sparkles className="h-4 w-4 text-violet-500" />
        </Button>
      </EditorBubbleItem>

      <EditorBubbleItem onSelect={handleFixGrammar}>
        <Button
          size="sm"
          className="rounded-none"
          variant="ghost"
          type="button"
          title="Ask AI to fix grammar & spelling"
        >
          <Pencil className="h-4 w-4 text-amber-500" />
        </Button>
      </EditorBubbleItem>
    </div>
  );
};
