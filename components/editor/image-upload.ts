import { createImageUpload } from "@/components/editor/headless";
import { toast } from "sonner";

const onUpload = (file: File) => {
  console.log("[Image Upload] Starting upload for file:", file.name, file.type, file.size);

  const promise = fetch("/api/upload", {
    method: "POST",
    headers: {
      "content-type": file?.type || "application/octet-stream",
      "x-vercel-filename": file?.name || "image.png",
    },
    body: file,
  });

  return new Promise((resolve, reject) => {
    toast.promise(
      promise.then(async (res) => {
        console.log("[Image Upload] Response status:", res.status);

        // Successfully uploaded image
        if (res.status === 200) {
          const { url } = (await res.json()) as { url: string };
          console.log("[Image Upload] Success! URL:", url);
          // preload the image
          const image = new Image();
          image.src = url;
          image.onload = () => {
            resolve(url);
          };
          // No blob store configured
        } else if (res.status === 401) {
          console.warn("[Image Upload] No BLOB token, using local file");
          resolve(file);
          // Don't throw here, as we've resolved with the local file
        } else {
          console.error("[Image Upload] Upload failed with status:", res.status);
          throw new Error("Error uploading image. Please try again.");
        }
      }),
      {
        loading: "Uploading image...",
        success: "Image uploaded successfully.",
        error: (e) => {
          console.error("[Image Upload] Error:", e);
          reject(e);
          return e.message;
        },
      },
    );
  });
};

export const uploadFn = createImageUpload({
  onUpload,
  validateFn: (file) => {
    console.log("[Image Upload] Validating file:", file.name, file.type, file.size);

    if (!file.type.includes("image/")) {
      console.error("[Image Upload] Validation failed: Not an image type");
      toast.error("File type not supported.");
      return false;
    }
    if (file.size / 1024 / 1024 > 20) {
      console.error("[Image Upload] Validation failed: File too large");
      toast.error("File size too big (max 20MB).");
      return false;
    }

    console.log("[Image Upload] Validation passed!");
    return true;
  },
});
