// Pictures, videos and documents an automation action or auto-reply step can send.
// Limits mirror lib/automation-media.ts, which is what actually enforces them.
export type MediaKind = "image" | "video" | "document";

export const mediaKindByType: Record<string, MediaKind> = {
  "إرسال صورة": "image",
  "إرسال فيديو": "video",
  "إرسال مستند": "document"
};

export const mediaAccept: Record<MediaKind, string> = {
  image: "image/jpeg,image/png",
  video: "video/mp4,video/3gpp",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
};

export function mediaChoose(kind: MediaKind, t: (ar: string, en: string) => string) {
  if (kind === "image") return t("اختر صورة", "Choose image");
  if (kind === "video") return t("اختر فيديو", "Choose video");
  return t("اختر مستندًا", "Choose document");
}

export function mediaWrongFile(kind: MediaKind, t: (ar: string, en: string) => string) {
  if (kind === "image") return t("اختر ملف صورة (JPG أو PNG).", "Choose an image file (JPG or PNG).");
  if (kind === "video") return t("اختر ملف فيديو (MP4).", "Choose a video file (MP4).");
  return t("اختر مستند PDF أو Word أو Excel أو PowerPoint أو نصًا.", "Choose a PDF, Word, Excel, PowerPoint or text file.");
}

export function mediaUploadFirst(kind: MediaKind, t: (ar: string, en: string) => string) {
  if (kind === "image") return t("ارفع الصورة أولًا.", "Upload the image first.");
  if (kind === "video") return t("ارفع الفيديو أولًا.", "Upload the video first.");
  return t("ارفع المستند أولًا.", "Upload the document first.");
}

export function mediaLimitHint(kind: MediaKind, t: (ar: string, en: string) => string) {
  if (kind === "image") return t("الصورة (JPG أو PNG، حتى 5 ميجا)", "Image (JPG or PNG, up to 5 MB)");
  if (kind === "video") return t("الفيديو (MP4، حتى 12 ميجا)", "Video (MP4, up to 12 MB)");
  return t("المستند (PDF أو Word أو Excel أو PowerPoint، حتى 10 ميجا)", "Document (PDF, Word, Excel, PowerPoint, up to 10 MB)");
}

/** The browser reports an empty or generic type for some office files, so only images and videos are checked client-side. */
export function mediaFileLooksRight(kind: MediaKind, file: File) {
  return kind === "document" || file.type.startsWith(`${kind}/`);
}
