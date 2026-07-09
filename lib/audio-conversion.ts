import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("amr")) return "amr";
  return "audio";
}

function getFfmpegPath() {
  const candidates = [
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), ".next", "server", "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join("/var/task", "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join("/var/task", ".next", "server", "node_modules", "ffmpeg-static", "ffmpeg")
  ];

  const existingPath = candidates.find((candidate) => candidate && existsSync(candidate));
  if (existingPath) return existingPath;

  throw new Error(`FFMPEG_UNAVAILABLE: ${candidates.filter(Boolean).join(", ")}`);
}

export async function convertAudioToMp3(inputBuffer: Buffer<ArrayBufferLike>, inputMimeType: string): Promise<{
  buffer: Buffer<ArrayBufferLike>;
  mimeType: "audio/mpeg";
  extension: "mp3";
}> {
  const resolvedFfmpegPath = getFfmpegPath();
  if (inputMimeType.toLowerCase().startsWith("audio/mpeg")) {
    return {
      buffer: inputBuffer,
      mimeType: "audio/mpeg",
      extension: "mp3"
    };
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "audiencew-audio-"));
  const inputPath = path.join(workDir, `input.${extensionFromMimeType(inputMimeType)}`);
  const outputPath = path.join(workDir, "output.mp3");

  try {
    await writeFile(inputPath, inputBuffer);
    await execFileAsync(resolvedFfmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-b:a",
      "64k",
      outputPath
    ], { timeout: 15000 });

    return {
      buffer: Buffer.from(await readFile(outputPath)),
      mimeType: "audio/mpeg",
      extension: "mp3"
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
