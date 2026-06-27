// LLM port (interface) + factory. The analysis engine depends ONLY on this shape,
// never on a concrete provider — that is what makes the provider swappable.
//
//   interface LLMProvider {
//     name: string
//     complete(prompt: string, opts?): Promise<string>
//     completeJSON(prompt: string, schema?, opts?): Promise<object>  // guaranteed JSON
//   }
import { config } from "../../config/index.js";
import { MockLLMProvider } from "./mock.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";

export function createLLMProvider(name = config.LLM_PROVIDER) {
  switch (name) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "mock":
    default:
      return new MockLLMProvider();
  }
}

// Strip markdown fences and parse JSON defensively (LLMs love ```json blocks).
export function safeJSONParse(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const startArr = cleaned.indexOf("[");
  const from = startArr !== -1 && (startArr < start || start === -1) ? startArr : start;
  const slice = from >= 0 ? cleaned.slice(from) : cleaned;
  return JSON.parse(slice);
}
