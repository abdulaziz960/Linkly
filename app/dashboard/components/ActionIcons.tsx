const base = { viewBox: "0 0 24 24", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** Row-action icons shared by the customers, tags and email campaign tables. */
export const ChatIcon = <svg {...base}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 11h7M8.5 14h4" /></svg>;
export const EditIcon = <svg {...base}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
export const MergeIcon = <svg {...base}><path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" /></svg>;
export const SendIcon = <svg {...base}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" /></svg>;
export const StopIcon = <svg {...base}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
export const TagsIcon = <svg {...base}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg>;
export const EyeIcon = <svg {...base}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const ListIcon = <svg {...base}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" /></svg>;
export const UsersIcon = <svg {...base}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M16 5.2a3 3 0 0 1 0 5.6M18 14.6c1.8.7 3 2.3 3.4 5.4" /></svg>;
