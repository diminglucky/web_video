import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { CHROME_EXECUTABLE_PATH, DEFAULT_TTS_PROVIDER } from "./config.js";

export async function getRuntimeHealth() {
  const [localExecution, chrome, ffmpeg, ffprobe, edgeTts, windowsSapi, say, piper] = await Promise.all([
    safeCheck(() => localExecutionCheck(), {
      ok: false,
      code: "UNKNOWN",
      message: "Local process launch check failed.",
    }),
    fileExists(CHROME_EXECUTABLE_PATH),
    safeCheck(() => commandAvailable("ffmpeg", ["-version"]), false),
    safeCheck(() => commandAvailable("ffprobe", ["-version"]), false),
    safeCheck(() => commandAvailable("edge-tts"), false),
    safeCheck(() => windowsSapiVoices(), { ok: false, voices: [] }),
    safeCheck(() => commandAvailable("say"), false),
    safeCheck(() => commandAvailable(process.env.PIPER_BIN || "piper"), false),
  ]);

  const checks = {
    localExecution,
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
      windowsSapiAvailable: windowsSapi.ok,
      windowsSapiVoices: windowsSapi.voices,
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

async function safeCheck(check, fallback) {
  try {
    return await check();
  } catch {
    return fallback;
  }
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
  if (provider === "windows-sapi") return tts.windowsSapiAvailable;
  if (provider === "edge-tts") return tts.edgeTtsAvailable;
  if (provider === "say") return tts.sayAvailable;
  if (provider === "piper") return tts.piperAvailable;
  return false;
}

function windowsSapiVoices() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$voice = New-Object -ComObject SAPI.SpVoice",
    "$voice.GetVoices() | ForEach-Object { $_.GetDescription() }",
  ].join("; ");

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      resolve({ ok: false, voices: [] });
      return;
    }
    let stdout = "";
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve({
        ok,
        voices: ok
          ? stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
          : [],
      });
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
  });
}

function commandAvailable(command, args = ["--version"]) {
  return new Promise((resolve) => {
    if (!command) {
      resolve(false);
      return;
    }

    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    let child;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      done(false);
      return;
    }
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0 || code === 1));
  });
}

function localExecutionCheck() {
  return new Promise((resolve) => {
    const probes = [
      [process.execPath, ["-e", "process.exit(0)"]],
      [process.platform === "win32" ? "powershell" : "sh", process.platform === "win32"
        ? ["-NoProfile", "-Command", "exit 0"]
        : ["-lc", "exit 0"]],
    ];
    const results = [];
    const runNext = () => {
      const probe = probes[results.length];
      if (!probe) {
        const failed = results.find((result) => !result.ok);
        resolve({
          ok: !failed,
          code: failed ? failed.code : "OK",
          message: failed
            ? formatLocalExecutionMessage(failed.error, failed.command)
            : "Backend can launch local helper processes.",
          probes: results.map(({ command, ok, code }) => ({ command, ok, code })),
        });
        return;
      }

      const [command, args] = probe;
      let child;
      try {
        child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch (error) {
        results.push({ command, ok: false, code: error?.code || "SPAWN_FAILED", error });
        runNext();
        return;
      }

      let settled = false;
      const done = (ok, code, error = null) => {
        if (settled) return;
        settled = true;
        results.push({ command, ok, code, error });
        runNext();
      };
      child.on("error", (error) => {
        done(false, error?.code || "SPAWN_FAILED", error);
      });
      child.on("close", (code) => {
        done(code === 0, code === 0 ? "OK" : `EXIT_${code}`);
      });
    };

    runNext();
  });
}

function formatLocalExecutionMessage(error, command = "local helper") {
  if (error?.code === "EPERM") {
    return `Backend cannot launch ${command} (spawn EPERM). Start the project from a normal Windows terminal or the local start script.`;
  }
  return error?.message || `Backend cannot launch ${command}.`;
}
