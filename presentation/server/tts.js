import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { projectAudioDir } from "./config.js";
import { badRequest, failedDependency } from "./errors.js";

export async function synthesizeProjectAudio(project, options = {}) {
  const provider = options.provider || project.tts?.provider || "edge-tts";
  const voice = options.voice || project.tts?.voice || "";
  const outRoot = projectAudioDir(project.id);
  const results = [];

  for (const segment of project.segments) {
    const out = path.join(outRoot, segment.audio);
    await fs.mkdir(path.dirname(out), { recursive: true });
    if (options.force !== true) {
      try {
        const stat = await fs.stat(out);
        if (stat.size > 0) {
          results.push({ ...segment, status: "skipped", path: out });
          continue;
        }
      } catch {
        // synthesize missing files
      }
    }
    await synthesizeOne({ provider, voice, text: segment.text, out });
    results.push({ ...segment, status: "created", path: out });
  }
  return results;
}

export async function synthesizeOne({ provider, voice, text, out }) {
  if (provider === "edge-tts") {
    const selectedVoice = voice || "zh-CN-YunxiNeural";
    try {
      return await run("edge-tts", [
        "--text",
        text,
        "--voice",
        selectedVoice,
        "--write-media",
        out,
      ]);
    } catch (error) {
      if (process.env.WEB_VIDEO_TTS_FALLBACK === "none") throw error;
      console.warn(`edge-tts failed, falling back to macOS say: ${error.message}`);
      return synthesizeOne({ provider: "say", voice: process.env.WEB_VIDEO_TTS_FALLBACK_VOICE || "Tingting", text, out });
    }
  }

  if (provider === "say") {
    const selectedVoice = voice || "Tingting";
    const tmp = `${out}.aiff`;
    await run("say", ["-v", selectedVoice, "-o", tmp, text]);
    try {
      await run("ffmpeg", [
        "-y",
        "-i",
        tmp,
        "-codec:a",
        "libmp3lame",
        "-qscale:a",
        "2",
        out,
      ]);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
    return;
  }

  if (provider === "openai") {
    return openAiSpeech({ text, out, voice });
  }

  if (provider === "piper") {
    const bin = process.env.PIPER_BIN || "piper";
    const model = process.env.PIPER_MODEL;
    if (!model) {
      throw failedDependency("PIPER_MODEL is not set. Download a Piper voice model and set PIPER_MODEL=/path/to/model.onnx.");
    }
    const wav = `${out}.wav`;
    await runWithInput(bin, ["--model", model, "--output_file", wav], text);
    try {
      await run("ffmpeg", ["-y", "-i", wav, "-codec:a", "libmp3lame", "-qscale:a", "2", out]);
    } finally {
      await fs.rm(wav, { force: true }).catch(() => {});
    }
    return;
  }

  throw badRequest(`Unsupported TTS provider: ${provider}`);
}

async function openAiSpeech({ text, out, voice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw failedDependency("OPENAI_API_KEY is not set on the backend.");
  const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const selectedVoice = voice || "coral";
  const response = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: selectedVoice,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!response.ok) {
    throw failedDependency(`OpenAI TTS failed: ${response.status} ${await response.text()}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(out, bytes);
}

function run(cmd, args) {
  return runWithInput(cmd, args, null);
}

function runWithInput(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(failedDependency(`${cmd} could not be started: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(failedDependency(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}
