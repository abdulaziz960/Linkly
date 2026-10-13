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

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  "3gp": "video/3gpp"
};

/** Reads the file as a data URL, filling in the type from the extension when the browser reports none (common for office files). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const guessed = MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() || ""];
      const comma = result.indexOf(",");
      const header = comma > 0 ? result.slice(0, comma) : "";
      const generic = !file.type || file.type === "application/octet-stream";
      resolve(guessed && generic && header.startsWith("data:") ? `data:${guessed};base64${result.slice(comma)}` : result);
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

/** What to tell the user when the upload call did not return a usable message. */
export function uploadFailureMessage(status: number, serverMessage: unknown, t: (ar: string, en: string) => string) {
  if (typeof serverMessage === "string" && serverMessage) return serverMessage;
  if (status === 413) return t("حجم الملف أكبر من المسموح.", "The file is larger than allowed.");
  if (status === 401 || status === 403) return t("انتهت الجلسة أو لا تملك الصلاحية. أعد تسجيل الدخول.", "Your session expired or you lack permission. Sign in again.");
  return t(`تعذر رفع الملف (رمز ${status || "؟"}).`, `Could not upload the file (code ${status || "?"}).`);
}
