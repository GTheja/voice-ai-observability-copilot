// Anthropic (Claude) provider — same port as OpenAI, demonstrating provider-agnosticism.
import { config } from "../../config/index.js";
import { RetryableError, AppError } from "../../lib/errors.js";
import { withTimeout } from "../../lib/retry.js";
import { safeJSONParse } from "./provider.js";

export class AnthropicProvider {
  constructor() {
    this.name = "anthropic";
    this.model = config.ANTHROPIC_MODEL;
  }

  async #messages(prompt, { json = false } = {}) {
    const sys = json
      ? "You are a precise Voice AI QA analyst. Respond with ONLY valid JSON, no prose."
      : "You are a precise Voice AI QA analyst. Be concise.";
    const res = await withTimeout(
      fetch(`${"https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          temperature: 0.2,
          system: sys,
          messages: [{ role: "user", content: prompt }],
        }),
      }),
      config.LLM_TIMEOUT_MS,
      "anthropic.messages",
    );

    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Anthropic transient error ${res.status}`, {
        code: "anthropic_transient",
      });
    }
    if (!res.ok) {
      throw new AppError(`Anthropic error ${res.status}: ${await res.text()}`, { status: res.status });
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  }

  async complete(prompt) {
    return this.#messages(prompt);
  }

  async completeJSON(prompt) {
    return safeJSONParse(await this.#messages(prompt, { json: true }));
  }
}
