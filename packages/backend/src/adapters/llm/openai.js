// OpenAI provider. Uses fetch (no SDK dependency) so the package stays lean.
// Wrapped with timeout + retry classification at the call site (analysis engine).
import { config } from "../../config/index.js";
import { RetryableError, AppError } from "../../lib/errors.js";
import { withTimeout } from "../../lib/retry.js";
import { safeJSONParse } from "./provider.js";

export class OpenAIProvider {
  constructor() {
    this.name = "openai";
    this.model = config.OPENAI_MODEL;
  }

  async #chat(prompt, { json = false } = {}) {
    const res = await withTimeout(
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: "You are a precise Voice AI QA analyst. Be concise." },
            { role: "user", content: prompt },
          ],
        }),
      }),
      config.LLM_TIMEOUT_MS,
      "openai.chat",
    );

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`OpenAI transient error ${res.status}`, { code: "openai_transient" });
    }
    if (!res.ok) {
      throw new AppError(`OpenAI error ${res.status}: ${await res.text()}`, { status: res.status });
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async complete(prompt) {
    return this.#chat(prompt);
  }

  async completeJSON(prompt) {
    return safeJSONParse(await this.#chat(prompt, { json: true }));
  }
}
