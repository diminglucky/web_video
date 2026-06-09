import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  CHROME_EXECUTABLE_PATH,
  PROJECTS_DIR,
  RENDER_BASE_URL,
  RENDER_FPS,
  RENDER_SETTLE_MS,
  projectRenderDir,
  projectVideoPath,
} from "./config.js";
import { failedDependency } from "./errors.js";

const VIEWPORT = { width: 1920, height: 1080 };

export async function renderProjectVideo(project) {
  if (!project?.segments?.length) {
    throw new Error("Project has no segments to render.");
  }
  if (!fsSync.existsSync(CHROME_EXECUTABLE_PATH)) {
    throw failedDependency(
      `Chrome executable not found. Set WEB_VIDEO_CHROME_PATH or install Chrome. Current: ${CHROME_EXECUTABLE_PATH}`,
    );
  }

  const renderDir = projectRenderDir(project.id);
  const frameDir = path.join(renderDir, "frames");
  const audioDir = path.join(renderDir, "audio");
  const silentVideo = path.join(renderDir, "silent.mp4");
  const audioTrack = path.join(renderDir, "voice.mp3");
  const videoOut = projectVideoPath(project.id);

  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(audioDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });
  await fs.mkdir(audioDir, { recursive: true });

  const durations = await getSegmentDurations(project);
  await captureFrames(project.id, frameDir, project.segments.length);
  await buildSilentVideo(frameDir, durations, silentVideo);
  const hasAudio = await buildAudioTrack(project, durations, audioDir, audioTrack);

  if (hasAudio) {
    await run("ffmpeg", [
      "-y",
      "-i",
      silentVideo,
      "-i",
      audioTrack,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      videoOut,
    ]);
  } else {
    await fs.copyFile(silentVideo, videoOut);
  }

  return {
    file: "render/video.mp4",
    url: `/storage/projects/${project.id}/render/video.mp4`,
    frames: project.segments.length,
    durationMs: Math.round(durations.reduce((sum, ms) => sum + ms, 0)),
    renderedAt: new Date().toISOString(),
  };
}

async function captureFrames(projectId, frameDir, totalSteps) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE_PATH,
    headless: true,
  });

  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (let i = 0; i < totalSteps; i += 1) {
      const url = new URL(RENDER_BASE_URL);
      url.searchParams.set("project", projectId);
      url.searchParams.set("renderStep", String(i));
      await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForSelector(".stage-frame", { timeout: 10000 });
      await page.waitForTimeout(RENDER_SETTLE_MS);
      await page.screenshot({
        path: framePath(frameDir, i),
        fullPage: false,
        animations: "disabled",
      });
    }
  } finally {
    await browser.close();
  }
}

async function getSegmentDurations(project) {
  const durations = [];
  for (const segment of project.segments) {
    const audioPath = path.join(projectAudioRoot(project.id), segment.audio);
    const duration = fsSync.existsSync(audioPath)
      ? await probeDurationMs(audioPath).catch(() => estimateMs(segment.text))
      : estimateMs(segment.text);
    durations.push(Math.max(1200, duration + 250));
  }
  return durations;
}

async function buildSilentVideo(frameDir, durations, out) {
  const listFile = path.join(path.dirname(out), "frames.txt");
  const lines = [];
  for (let i = 0; i < durations.length; i += 1) {
    lines.push(`file '${escapeConcatPath(framePath(frameDir, i))}'`);
    lines.push(`duration ${(durations[i] / 1000).toFixed(3)}`);
  }
  lines.push(`file '${escapeConcatPath(framePath(frameDir, durations.length - 1))}'`);
  await fs.writeFile(listFile, `${lines.join("\n")}\n`);

  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-fps_mode",
    "vfr",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-movflags",
    "+faststart",
    out,
  ]);
}

async function buildAudioTrack(project, durations, audioDir, out) {
  const listFile = path.join(audioDir, "audio.txt");
  const lines = [];
  let hasRealAudio = false;

  for (let i = 0; i < project.segments.length; i += 1) {
    const segment = project.segments[i];
    const source = path.join(projectAudioRoot(project.id), segment.audio);
    const part = path.join(audioDir, `${String(i + 1).padStart(3, "0")}.mp3`);
    if (fsSync.existsSync(source)) {
      hasRealAudio = true;
      await normalizeAudioPart(source, part, durations[i]);
    } else {
      await generateSilence(part, durations[i]);
    }
    lines.push(`file '${escapeConcatPath(part)}'`);
  }

  if (!hasRealAudio) return false;

  await fs.writeFile(listFile, `${lines.join("\n")}\n`);
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    "2",
    out,
  ]);
  return true;
}

async function normalizeAudioPart(source, out, durationMs) {
  await run("ffmpeg", [
    "-y",
    "-i",
    source,
    "-af",
    "apad",
    "-t",
    (durationMs / 1000).toFixed(3),
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    "2",
    out,
  ]);
}

async function generateSilence(out, durationMs) {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t",
    (durationMs / 1000).toFixed(3),
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    "9",
    out,
  ]);
}

async function probeDurationMs(file) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number(output.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not probe duration for ${file}`);
  }
  return seconds * 1000;
}

function estimateMs(text) {
  return Math.max(1500, String(text || "").length * 250);
}

function projectAudioRoot(projectId) {
  return path.join(PROJECTS_DIR, projectId, "audio");
}

function framePath(frameDir, index) {
  return path.join(frameDir, `frame-${String(index + 1).padStart(4, "0")}.png`);
}

function escapeConcatPath(file) {
  return file.replace(/'/g, "'\\''");
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(failedDependency(`${cmd} could not be started: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(failedDependency(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}
