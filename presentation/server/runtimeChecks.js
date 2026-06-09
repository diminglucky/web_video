import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { CHROME_EXECUTABLE_PATH, DEFAULT_TTS_PROVIDER } from "./config.js";

export async function getRuntimeHealth() {
  const [chrome, ffmpeg, ffprobe, edgeTts, say, piper] = await Promise.all([
    fileExists(CHROME_EXECUTABLE_PATH),
    commandAvailable("ffmpeg"),
    commandAvailable("ffprobe"),
    commandAvailable("edge-tts"),
    commandAvailable("say"),
    commandAvailable(process.env.PIPER_BIN || "piper"),
  ]);

  const checks = {
    chrome: {
      ok: chrome,
      path: CHROME_EXECUTABLE_PATH,
      message: chrome ? "Chrome executable found." : "Chrome executable not found.",
    },
    ffmpeg: commandCheck(ffmpeg, "ffmpeg"),
    ffprobe: commandCheck(ffprobe, "ffprobe"),
    tts: {
      provider: DEFAULT_TTS_PROVIDER,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      edgeTtsAvailable: edgeTts,
      sayAvailable: say,
      piperAvailable: piper && Boolean(process.env.PIPER_MODEL),
      piperModelConfigured: Boolean(process.env.PIPER_MODEL),
    },
  };

  return {
    checks,
    chromeConfigured: checks.chrome.ok,
    ffmpegConfigured: checks.ffmpeg.ok,
    ffprobeConfigured: checks.ffprobe.ok,
    ttsConfigured: providerAvailable(DEFAULT_TTS_PROVIDER, checks.tts),
  };
}

async function fileExists(file) {
  if (!file) return false;
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

function commandCheck(ok, command) {
  return {
    ok,
    command,
    message: ok ? `${command} is available.` : `${command} is not available in PATH.`,
  };
}

function providerAvailable(provider, tts) {
  if (provider === "openai") return tts.openaiConfigured;
  if (provider === "edge-tts") return tts.edgeTtsAvailable;
  if (provider === "say") return tts.sayAvailable;
  if (provider === "piper") return tts.piperAvailable;
  return false;
}

function commandAvailable(command) {
  return new Promise((resolve) => {
    if (!command) {
      resolve(false);
      return;
    }

    const child = spawn(command, ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0 || code === 1));
  });
}
