import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { projectAudioDir } from "./config.js";
import { badRequest, failedDependency } from "./errors.js";

const OPENAI_TTS_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
]);

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export async function synthesizeProjectAudio(project, options = {}) {
  const provider = options.provider || project.tts?.provider || "edge-tts";
  const voice = options.voice || project.tts?.voice || "";
  const rate = normalizeRate(options.rate ?? project.tts?.rate ?? process.env.WEB_VIDEO_TTS_RATE);
  const volume = normalizeVolume(options.volume ?? project.tts?.volume ?? process.env.WEB_VIDEO_TTS_VOLUME);
  const format = normalizeAudioFormat(options.format ?? project.tts?.format ?? process.env.WEB_VIDEO_TTS_FORMAT);
  const outRoot = projectAudioDir(project.id);
  const results = [];

  for (const segment of project.segments) {
    segment.audio = audioPathFor(segment, format);
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
    await synthesizeOne({
      provider,
      voice,
      text: segment.narration || segment.text,
      out,
      rate,
      volume,
      format,
    });
    results.push({ ...segment, status: "created", path: out });
  }
  return results;
}

export async function testLocalTtsSettings(input = {}) {
  const provider = input.provider || process.env.WEB_VIDEO_TTS_PROVIDER || "windows-sapi";
  const voice = String(input.voice || process.env.WEB_VIDEO_TTS_VOICE || "").trim();
  const rate = normalizeRate(input.rate ?? process.env.WEB_VIDEO_TTS_RATE);
  const volume = normalizeVolume(input.volume ?? process.env.WEB_VIDEO_TTS_VOLUME);
  const format = normalizeAudioFormat(input.format ?? process.env.WEB_VIDEO_TTS_FORMAT);
  const tempDir = await fs.mkdtemp(path.join(await fs.realpath(process.cwd()), "tts-test-"));
  const out = path.join(tempDir, `sample.${format}`);
  try {
    await synthesizeOne({
      provider,
      voice,
      text: "本地语音测试成功",
      out,
      rate,
      volume,
      format,
    });
    const stat = await fs.stat(out);
    if (!stat.size) throw failedDependency("本地 TTS 测试失败：生成了空音频文件。");
    return {
      ok: true,
      provider,
      voice: voice || getDefaultLocalVoice(provider),
      rate,
      volume,
      format,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function testOpenAiSpeechSettings(input = {}) {
  const apiKey = String(input.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw failedDependency("请先填写或保存 API Key，再测试 OpenAI TTS。");
  }

  const base = normalizeOpenAiSpeechBaseUrl(
    input.baseUrl || process.env.OPENAI_TTS_BASE_URL || process.env.OPENAI_BASE_URL,
  );
  const model = String(input.model || process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts").trim();
  const selectedVoice = normalizeOpenAiVoice(input.voice);
  const speechUrl = `${base}/audio/speech`;
  const response = await fetch(speechUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: selectedVoice,
      input: "语音接口测试",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    throw failedDependency(formatOpenAiSpeechError({
      status: response.status,
      detail: await response.text(),
      speechUrl,
    }));
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw failedDependency("OpenAI TTS 测试失败：接口返回了空音频。");
  }

  return {
    ok: true,
    baseUrl: base,
    model,
    voice: selectedVoice,
  };
}

export async function synthesizeOne({ provider, voice, text, out, rate = 0, volume = 100, format = "mp3" }) {
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
      const fallback = process.env.WEB_VIDEO_TTS_FALLBACK || "none";
      if (fallback === "openai" || (fallback === "none" && process.env.OPENAI_API_KEY)) {
        console.warn(`edge-tts failed, falling back to OpenAI TTS: ${error.message}`);
        return synthesizeOne({ provider: "openai", voice: "coral", text, out });
      }
      if (fallback === "say") {
        console.warn(`edge-tts failed, falling back to macOS say: ${error.message}`);
        return synthesizeOne({
          provider: "say",
          voice: process.env.WEB_VIDEO_TTS_FALLBACK_VOICE || "Tingting",
          text,
          out,
        });
      }
      if (fallback === "piper") {
        console.warn(`edge-tts failed, falling back to Piper: ${error.message}`);
        return synthesizeOne({ provider: "piper", voice, text, out });
      }
      throw error;
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

  if (provider === "windows-sapi") {
    return windowsSapiSpeech({ text, out, voice, rate, volume, format });
  }

  if (provider === "piper") {
    const bin = process.env.PIPER_BIN || "piper";
    const model = process.env.PIPER_MODEL;
    if (!model) {
      throw failedDependency("PIPER_MODEL is not set. Download a Piper voice model and set PIPER_MODEL=/path/to/model.onnx.");
    }
    const wav = `${out}.wav`;
    const args = ["--model", model, "--output_file", wav];
    await runWithInput(bin, args, text);
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
  if (!apiKey) throw failedDependency("后端没有保存 OPENAI_API_KEY，无法使用 OpenAI TTS。请先到设置页保存 API Key。");
  const base = normalizeOpenAiSpeechBaseUrl(
    process.env.OPENAI_TTS_BASE_URL || process.env.OPENAI_BASE_URL,
  );
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const selectedVoice = normalizeOpenAiVoice(voice);
  const speechUrl = `${base}/audio/speech`;
  const response = await fetch(speechUrl, {
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
    throw failedDependency(formatOpenAiSpeechError({
      status: response.status,
      detail: await response.text(),
      speechUrl,
    }));
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(out, bytes);
}

async function windowsSapiSpeech({ text, out, voice, rate, volume, format }) {
  const wav = format === "wav" ? out : `${out}.wav`;
  const script = buildWindowsSapiScript({ text, out: wav, voice, rate, volume });
  await runPowerShellScript(script);
  await assertAudioFile(wav, "Windows 本地语音没有生成有效音频文件。");

  if (format !== "wav") {
    try {
      await run("ffmpeg", ["-y", "-i", wav, "-codec:a", "libmp3lame", "-qscale:a", "2", out]);
      await assertAudioFile(out, "ffmpeg 没有生成有效 MP3 文件。");
    } finally {
      await fs.rm(wav, { force: true }).catch(() => {});
    }
  }
}

function buildWindowsSapiScript({ text, out, voice, rate, volume }) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$voice = New-Object -ComObject SAPI.SpVoice",
    `$voice.Rate = ${normalizeRate(rate)}`,
    `$voice.Volume = ${normalizeVolume(volume)}`,
    `$selectedVoice = ${toPowerShellString(voice)}`,
    "if ($selectedVoice) {",
    "  $match = $voice.GetVoices() | Where-Object { $_.GetDescription() -eq $selectedVoice } | Select-Object -First 1",
    "  if ($match -ne $null) { $voice.Voice = $match }",
    "}",
    "$stream = New-Object -ComObject SAPI.SpFileStream",
    "$format = New-Object -ComObject SAPI.SpAudioFormat",
    "$format.Type = 22",
    "$stream.Format = $format",
    `$stream.Open(${toPowerShellString(out)}, 3, $false)`,
    "$voice.AudioOutputStream = $stream",
    `$voice.Speak(${toPowerShellString(text)}) | Out-Null`,
    "$stream.Close()",
  ].join("\n");
}

function normalizeOpenAiVoice(voice) {
  const value = String(voice || "").trim().toLowerCase();
  return OPENAI_TTS_VOICES.has(value) ? value : "coral";
}

function normalizeRate(value) {
  const number = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-10, Math.min(10, number));
}

function normalizeVolume(value) {
  const number = Number.parseInt(String(value ?? "100"), 10);
  if (!Number.isFinite(number)) return 100;
  return Math.max(0, Math.min(100, number));
}

function normalizeAudioFormat(value) {
  return String(value || "mp3").toLowerCase() === "wav" ? "wav" : "mp3";
}

function audioPathFor(segment, format) {
  const ext = normalizeAudioFormat(format);
  return `${segment.chapter}/${segment.step}.${ext}`;
}

function getDefaultLocalVoice(provider) {
  if (provider === "windows-sapi") return "Microsoft Huihui Desktop - Chinese (Simplified)";
  return "";
}

function toPowerShellString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function normalizeOpenAiSpeechBaseUrl(value) {
  let base = String(value || DEFAULT_OPENAI_BASE_URL).trim() || DEFAULT_OPENAI_BASE_URL;
  base = base.replace(/\/+$/u, "");

  for (const suffix of [
    "/audio/speech",
    "/chat/completions",
    "/responses",
    "/models",
  ]) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }

  return base.replace(/\/+$/u, "") || DEFAULT_OPENAI_BASE_URL;
}

function formatOpenAiSpeechError({ status, detail, speechUrl }) {
  const cleanDetail = trimDetail(detail);
  if (status === 404) {
    return [
      `OpenAI TTS 合成失败：${status} ${cleanDetail}`,
      `当前语音接口地址为 ${speechUrl}。`,
      "这个地址通常只支持文稿大模型，不支持 /audio/speech。请在设置页单独填写支持语音的 OPENAI_TTS_BASE_URL，或把 TTS Provider 改成 edge-tts / Piper。",
    ].join(" ");
  }
  return `OpenAI TTS 合成失败：${status} ${cleanDetail}`;
}

function run(cmd, args) {
  return runWithInput(cmd, args, null);
}

function runPowerShellScript(script) {
  return run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    Buffer.from(script, "utf16le").toString("base64"),
  ]);
}

async function assertAudioFile(file, message) {
  try {
    const stat = await fs.stat(file);
    if (stat.size > 1024) return;
    throw failedDependency(`${message} 文件过小（${stat.size} 字节）。`);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw failedDependency(`${message} 文件不存在：${file}`);
    }
    throw error;
  }
}

function runWithInput(cmd, args, input) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      reject(failedDependency(formatSpawnError(cmd, error)));
      return;
    }
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(failedDependency(formatSpawnError(cmd, error)));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(failedDependency(formatProcessExitError(cmd, code, stderr)));
    });
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

function formatProcessExitError(cmd, code, stderr) {
  const detail = stderr.trim();
  if (cmd === "powershell" && /0x80070005|E_ACCESSDENIED|Access is denied/i.test(detail)) {
    return [
      "Windows 本地语音被系统拒绝访问（E_ACCESSDENIED）。",
      "这通常是当前 Windows 语音组件、音频设备权限或安全软件拦截导致的。",
      "请先在设置页改用 OpenAI TTS，或安装 Piper 本地模型；如果坚持用 Windows 本地语音，需要修复系统语音权限后再测试。",
    ].join(" ");
  }
  if (cmd === "powershell" && /0x80045040/i.test(detail)) {
    return [
      "Windows 本地语音引擎返回 0x80045040，未能写入语音文件。",
      "这通常表示当前系统语音输出或文件流不可用。请改用 OpenAI TTS 或 Piper 本地模型。",
    ].join(" ");
  }
  return `${cmd} exited ${code}: ${detail}`;
}

function formatSpawnError(cmd, error) {
  if (error?.code === "ENOENT") {
    return `${cmd} 未安装或不在 PATH 中。请到设置页换成可用 TTS provider，或安装 ${cmd}。`;
  }
  if (error?.code === "EPERM") {
    return `${cmd} 被系统拒绝启动（spawn EPERM）。当前环境不能运行这个本地命令，请在设置页把 TTS Provider 改成 OpenAI API，或检查系统权限/杀毒拦截。`;
  }
  return `${cmd} 无法启动：${error.message}`;
}

function trimDetail(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}
