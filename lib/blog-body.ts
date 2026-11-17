// The picture line of an article body. Pure text helpers, shared by the server (blog-store) and the editor buttons in the browser.

/** A line of its own: ![alt text](/media/photo.webp "800x450"); the quoted size is optional. The address is a site path or an https link. */
export const IMAGE_LINE = /^!\[([^\]]*)\]\((\/(?!\/)[^)\s"]*|https?:\/\/[^)\s"]+)(?:\s+"(\d{1,5})x(\d{1,5})")?\)$/;

export function imageMarkdown(alt: string, src: string, width?: number, height?: number): string {
  return `![${alt.replace(/[[\]\n]/g, " ").trim()}](${src}${width && height ? ` "${width}x${height}"` : ""})`;
}
