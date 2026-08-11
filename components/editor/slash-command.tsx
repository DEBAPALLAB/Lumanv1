import {
  Calendar,
  CheckSquare,
  Code,
  FileIcon,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  MessageSquarePlus,
  Pencil,
  Sparkles,
  Table,
  Text,
  TextQuote,
  Youtube,
} from "lucide-react";
import { Command, createSuggestionItems, renderItems } from "@/components/editor/headless";
import { uploadFile } from "@/components/editor/file-upload";
import { uploadFn } from "@/components/editor/image-upload";

export const suggestionItems = createSuggestionItems([
  {
    title: "Table",
    description: "Insert a table with 3 rows and 3 columns.",
    searchTerms: ["table", "grid", "spreadsheet", "data"],
    icon: <Table size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "Add Row Below",
    description: "Add a row below the current row in table.",
    searchTerms: ["table", "row", "add"],
    icon: <Table size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).addRowAfter().run();
    },
  },
  {
    title: "Add Column Right",
    description: "Add a column to the right in table.",
    searchTerms: ["table", "column", "add"],
    icon: <Table size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).addColumnAfter().run();
    },
  },
  {
    title: "Delete Row",
    description: "Delete the current row in table.",
    searchTerms: ["table", "row", "delete", "remove"],
    icon: <Table size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).deleteRow().run();
    },
  },
  {
    title: "Delete Column",
    description: "Delete the current column in table.",
    searchTerms: ["table", "column", "delete", "remove"],
    icon: <Table size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).deleteColumn().run();
    },
  },
  {
    title: "Schedule",
    description: "Create an event or reminder linked to this note.",
    searchTerms: ["schedule", "event", "reminder", "calendar", "date"],
    icon: <Calendar size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // Dispatch custom event to trigger event modal
      window.dispatchEvent(new CustomEvent("open-event-modal"));
    },
  },
  {
    title: "Explain",
    description: "Ask AI to explain the selected text.",
    searchTerms: ["explain", "ai", "ask"],
    icon: <Sparkles size={18} />,
    command: ({ editor, range }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);
      if (text) {
        window.dispatchEvent(
          new CustomEvent("ai-chat-trigger", {
            detail: { action: "explain", text },
          }),
        );
      }
      editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    title: "Fix Grammar",
    description: "Ask AI to fix grammar/spelling.",
    searchTerms: ["fix", "grammar", "spelling", "ai"],
    icon: <Pencil size={18} />,
    command: ({ editor, range }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);
      if (text) {
        window.dispatchEvent(
          new CustomEvent("ai-chat-trigger", {
            detail: { action: "fix", text },
          }),
        );
      }
      editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    title: "Send Feedback",
    description: "Let us know how we can improve.",
    icon: <MessageSquarePlus size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.open("/feedback", "_blank");
    },
  },
  {
    title: "Text",
    description: "Just start typing with plain text.",
    searchTerms: ["p", "paragraph"],
    icon: <Text size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
    },
  },
  {
    title: "To-do List",
    description: "Track tasks with a to-do list.",
    searchTerms: ["todo", "task", "list", "check", "checkbox"],
    icon: <CheckSquare size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large"],
    icon: <Heading1 size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "medium"],
    icon: <Heading2 size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["subtitle", "small"],
    icon: <Heading3 size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list.",
    searchTerms: ["unordered", "point"],
    icon: <List size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a list with numbering.",
    searchTerms: ["ordered"],
    icon: <ListOrdered size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Quote",
    description: "Capture a quote.",
    searchTerms: ["blockquote"],
    icon: <TextQuote size={18} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").toggleBlockquote().run(),
  },
  {
    title: "Code",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock"],
    icon: <Code size={18} />,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Image",
    description: "Upload an image from your computer.",
    searchTerms: ["photo", "picture", "media"],
    icon: <ImageIcon size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // upload image
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          const pos = editor.view.state.selection.from;
          uploadFn(file, editor.view, pos);
        }
      };
      input.click();
    },
  },
  {
    title: "File",
    description: "Upload any file (PDF, DOC, video, etc.)",
    searchTerms: ["file", "upload", "attachment", "pdf", "doc"],
    icon: <FileIcon size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          try {
            const result = await uploadFile(file);
            editor.commands.setFileAttachment({
              url: result.url,
              filename: file.name,
              filesize: file.size,
              filetype: file.type,
            });
          } catch (error) {
            console.error("File upload failed", error);
          }
        }
      };
      input.click();
    },
  },
  {
    title: "Youtube",
    description: "Embed a Youtube video.",
    searchTerms: ["video", "youtube", "embed"],
    icon: <Youtube size={18} />,
    command: ({ editor, range }) => {
      const videoLink = prompt("Please enter Youtube Video Link");
      //From https://regexr.com/3dj5t
      const ytregex = new RegExp(
        /^((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/,
      );

      if (ytregex.test(videoLink)) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setYoutubeVideo({
            src: videoLink,
          })
          .run();
      } else {
        if (videoLink !== null) {
          alert("Please enter a correct Youtube Video Link");
        }
      }
    },
  },
  //   title: "Twitter",
  //   description: "Embed a Tweet.",
  //   searchTerms: ["twitter", "embed"],
  //   icon: <Twitter size={18} />,
  //   command: ({ editor, range }) => {
  //     const tweetLink = prompt("Please enter Twitter Link");
  //     const tweetRegex = new RegExp(/^https?:\/\/(www\.)?x\.com\/([a-zA-Z0-9_]{1,15})(\/status\/(\d+))?(\/\S*)?$/);

  //     if (tweetRegex.test(tweetLink)) {
  //       editor
  //         .chain()
  //         .focus()
  //         .deleteRange(range)
  //         .setTweet({
  //           src: tweetLink,
  //         })
  //         .run();
  //     } else {
  //       if (tweetLink !== null) {
  //         alert("Please enter a correct Twitter Link");
  //       }
  //     }
  //   },
  // },
]);

export const slashCommand = Command.configure({
  suggestion: {
    items: () => suggestionItems,
    render: renderItems,
  },
});
