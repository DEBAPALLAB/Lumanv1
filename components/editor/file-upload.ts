import { toast } from "sonner";

const onUploadFile = (file: File) => {
  console.log("[File Upload] Starting upload for file:", file.name, file.type, file.size);

  const promise = fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": file?.type || "application/octet-stream",
      "x-vercel-filename": file?.name || "file",
    },
    body: file,
  });

  return new Promise((resolve, reject) => {
    toast.promise(
      promise.then(async (res) => {
        console.log("[File Upload] Response status:", res.status);

        if (res.status === 200) {
          const data = (await res.json()) as { url: string; pathname: string; contentType: string };
          console.log("[File Upload] Success! URL:", data.url);
          resolve(data);
        } else if (res.status === 401) {
          console.warn("[File Upload] No BLOB token configured");
          throw new Error("`BLOB_READ_WRITE_TOKEN` environment variable not found.");
        } else {
          console.error("[File Upload] Upload failed with status:", res.status);
          throw new Error("Error uploading file. Please try again.");
        }
      }),
      {
        loading: "Uploading file...",
        success: "File uploaded successfully.",
        error: (e) => {
          console.error("[File Upload] Error:", e);
          reject(e);
          return e.message;
        },
      },
    );
  });
};

export const uploadFile = (file: File): Promise<{ url: string; pathname: string; contentType: string }> => {
  console.log("[File Upload] Validating file:", file.name, file.type, file.size);

  // Validate file size (50MB for general files, 100MB for videos)
  const isVideo = file.type.startsWith("video/");
  const maxSize = isVideo ? 100 : 50; // MB
  const fileSizeMB = file.size / 1024 / 1024;

  if (fileSizeMB > maxSize) {
    console.error("[File Upload] Validation failed: File too large");
    toast.error(`File size too big (max ${maxSize}MB).`);
    return Promise.reject(new Error("File too large"));
  }

  console.log("[File Upload] Validation passed!");
  return onUploadFile(file) as Promise<{ url: string; pathname: string; contentType: string }>;
};
