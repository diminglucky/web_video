import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { ENV_FILE } from "./config.js";
import { readSettings, saveSettings } from "./settings.js";

test("saveSettings persists api key without echoing it", async () => {
  await withEnvFile(async () => {
    const saved = await saveSettings({
      OPENAI_API_KEY: "secret-key",
      OPENAI_BASE_URL: "http://127.0.0.1:19092/v1",
      WEB_VIDEO_LLM_MODEL: "demo-model",
    });

    assert.equal(saved.values.OPENAI_API_KEY, "");
    assert.equal(saved.secrets.OPENAI_API_KEY, true);
    assert.equal(saved.values.OPENAI_BASE_URL, "http://127.0.0.1:19092/v1");
    assert.equal(saved.values.WEB_VIDEO_LLM_MODEL, "demo-model");

    const raw = await fs.readFile(ENV_FILE, "utf8");
    assert.match(raw, /^OPENAI_API_KEY=secret-key$/m);

    const reloaded = await readSettings();
    assert.equal(reloaded.values.OPENAI_API_KEY, "");
    assert.equal(reloaded.secrets.OPENAI_API_KEY, true);
  });
});

test("saveSettings can clear a stored api key", async () => {
  await withEnvFile(async () => {
    await saveSettings({ OPENAI_API_KEY: "secret-key" });
    process.env.OPENAI_API_KEY = "stale-process-key";

    const saved = await saveSettings({
      OPENAI_API_KEY: "",
      OPENAI_API_KEY_CLEAR: true,
    });

    assert.equal(saved.values.OPENAI_API_KEY, "");
    assert.equal(saved.secrets.OPENAI_API_KEY, false);
    assert.equal(process.env.OPENAI_API_KEY, "");

    const raw = await fs.readFile(ENV_FILE, "utf8");
    assert.match(raw, /^OPENAI_API_KEY=$/m);
  });
});

async function withEnvFile(run) {
  const previousEnv = {};
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_TTS_BASE_URL",
    "WEB_VIDEO_LLM_MODEL",
    "WEB_VIDEO_SCRIPT_PROVIDER",
  ];
  for (const key of keys) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }

  let previousFile = null;
  try {
    previousFile = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    previousFile = null;
  }

  try {
    await fs.writeFile(ENV_FILE, "", "utf8");
    await run();
  } finally {
    if (previousFile == null) await fs.rm(ENV_FILE, { force: true });
    else await fs.writeFile(ENV_FILE, previousFile, "utf8");

    for (const key of keys) {
      if (previousEnv[key] == null) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}
