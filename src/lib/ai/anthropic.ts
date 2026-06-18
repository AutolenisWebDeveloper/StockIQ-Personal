import Anthropic from "@anthropic-ai/sdk";

// Lazy Anthropic client — instantiated on first use (at runtime in the worker),
// so importing this module during `next build` never requires an API key.
let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Reasoning model for narrative composition (the LLM only narrates around
// deterministic engine values — see the composition principle).
export const REASONING_MODEL = "claude-opus-4-8";
