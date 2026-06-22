import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeOne, testOpenAiSpeechSettings } from "./tts.js";

test("testOpenAiSpeechSettings calls the configured OpenAI speech endpoint", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousBase = process.env.OPENAI_TTS_BASE_URL;
  const previousFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TTS_BASE_URL = "https://voice.example.test/v1/models";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://voice.example.test/v1/audio/speech");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.voice, "coral");
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  };

  try {
    const result = await testOpenAiSpeechSettings({
      model: "gpt-4o-mini-tts",
      voice: "coral",
    });

    assert.equal(result.ok, true);
    assert.equal(result.baseUrl, "https://voice.example.test/v1");
  } finally {
    restore("OPENAI_API_KEY", previousKey);
    restore("OPENAI_TTS_BASE_URL", previousBase);
    globalThis.fetch = previousFetch;
  }
});

test("testOpenAiSpeechSettings explains 404 speech endpoint failures", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousBase = process.env.OPENAI_TTS_BASE_URL;
  const previousFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TTS_BASE_URL = "https://text-only.example.test/v1";
  globalThis.fetch = async () =>
    new Response("404 page not found", { status: 404 });

  try {
    await assert.rejects(
      () => testOpenAiSpeechSettings({ model: "gpt-4o-mini-tts" }),
      /不支持 \/audio\/speech/u,
    );
  } finally {
    restore("OPENAI_API_KEY", previousKey);
    restore("OPENAI_TTS_BASE_URL", previousBase);
    globalThis.fetch = previousFetch;
  }
});

function restore(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}
