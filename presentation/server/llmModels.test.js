import test from "node:test";
import assert from "node:assert/strict";
import { listLlmModels } from "./llmModels.js";

test("listLlmModels returns text models from OpenAI-compatible /models", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousBase = process.env.OPENAI_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://example.test/v1";
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://example.test/v1/models");
    return new Response(
      JSON.stringify({
        data: [
          { id: "gpt-4o-mini", owned_by: "openai" },
          { id: "text-embedding-3-small", owned_by: "openai" },
          { id: "deepseek-chat", owned_by: "deepseek" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await listLlmModels();

  assert.deepEqual(
    result.models.map((model) => model.id),
    ["deepseek-chat", "gpt-4o-mini"],
  );

  restore("OPENAI_API_KEY", previousKey);
  restore("OPENAI_BASE_URL", previousBase);
  globalThis.fetch = previousFetch;
});

function restore(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}
