import OpenAI from "openai";

// Lazy OpenAI client — used only for embeddings (text-embedding-3-small, 1536
// dims, matching the filing_chunks vector(1536) column).
let client: OpenAI | undefined;

export function getOpenAI(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;
