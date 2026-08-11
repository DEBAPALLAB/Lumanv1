import { Node as TiptapNode, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Download, File, FileText, FileSpreadsheet, FileVideo, FileAudio, FileArchive, FileImage } from "lucide-react";

const getFileIcon = (filetype: string) => {
  if (filetype.startsWith("image/")) return <FileImage className="h-8 w-8" />;
  if (filetype.startsWith("video/")) return <FileVideo className="h-8 w-8" />;
  if (filetype.startsWith("audio/")) return <FileAudio className="h-8 w-8" />;
  if (filetype.includes("pdf")) return <FileText className="h-8 w-8" />;
  if (filetype.includes("spreadsheet") || filetype.includes("excel")) return <FileSpreadsheet className="h-8 w-8" />;
  if (filetype.includes("zip") || filetype.includes("rar") || filetype.includes("7z")) return <FileArchive className="h-8 w-8" />;
  return <File className="h-8 w-8" />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileAttachmentComponent = ({ node }: NodeViewProps) => {
  const { url, filename, filesize, filetype } = node.attrs;

  const handleDownload = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed", error);
      // Fallback to simple link
      window.open(url, "_blank");
    }
  };

  return (
    <NodeViewWrapper className="file-attachment-wrapper inline-block w-[calc(50%-1rem)] min-w-[200px] m-2 align-top">
      <div className="flex flex-col gap-3 p-3 border border-border rounded-xl bg-card hover:bg-accent/50 transition-all group relative">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 text-muted-foreground p-2 bg-muted rounded-lg">
            {getFileIcon(filetype)}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs truncate" title={filename}>{filename}</p>
            <p className="text-[10px] text-muted-foreground">
              {formatFileSize(filesize)}
            </p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 w-full p-2 mt-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-xs font-medium"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download</span>
        </button>
      </div>
    </NodeViewWrapper>
  );
};

export interface FileAttachmentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFileAttachment: (options: { 
        url: string; 
        filename: string; 
        filesize: number; 
        filetype: string;
      }) => ReturnType;
    };
  }
}

export const FileAttachment = TiptapNode.create<FileAttachmentOptions>({
  name: "fileAttachment",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentComponent);
  },

  addAttributes() {
    return {
      url: {
        default: null,
      },
      filename: {
        default: null,
      },
      filesize: {
        default: null,
      },
      filetype: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-file-attachment]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-file-attachment": "" })];
  },

  addCommands() {
    return {
      setFileAttachment:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
