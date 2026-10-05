import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDbPath = join(process.cwd(), "tests", ".tmp-client-notes.db");

beforeAll(() => {
  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  vi.stubEnv("DATABASE_URL", `file:${testDbPath}`);
  vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
});

afterAll(async () => {
  const { prisma } = await import("../lib/prisma");
  await prisma.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = `${testDbPath}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("validateNoteBody", () => {
  it("trims, rejects empty and over-long notes", async () => {
    const { validateNoteBody, CLIENT_NOTE_MAX_LENGTH } = await import("../lib/client-notes");
    expect(validateNoteBody("  اتصلنا بالعميل  ")).toEqual({ ok: true, body: "اتصلنا بالعميل" });
    expect(validateNoteBody("   ").ok).toBe(false);
    expect(validateNoteBody(42).ok).toBe(false);
    expect(validateNoteBody("x".repeat(CLIENT_NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe("client notes storage", () => {
  it("adds, lists newest first, and deletes only within the same tenant", async () => {
    const { addClientNote, listClientNotes, deleteClientNote } = await import("../lib/client-notes");
    const author = { id: "admin-1", name: "سارة" };
    const first = await addClientNote("tenant-a", author, "الملاحظة الأولى");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await addClientNote("tenant-a", author, "الملاحظة الثانية");
    await addClientNote("tenant-b", author, "لعميل آخر");

    const notes = await listClientNotes("tenant-a");
    expect(notes.map((note) => note.body)).toEqual(["الملاحظة الثانية", "الملاحظة الأولى"]);
    expect(notes[0].authorName).toBe("سارة");

    // A note id from another tenant must not be deletable through this tenant.
    expect(await deleteClientNote("tenant-b", first.id)).toBe(false);
    expect(await deleteClientNote("tenant-a", first.id)).toBe(true);
    expect((await listClientNotes("tenant-a")).map((note) => note.id)).toEqual([second.id]);
    expect(await listClientNotes("tenant-b")).toHaveLength(1);
  });
});
