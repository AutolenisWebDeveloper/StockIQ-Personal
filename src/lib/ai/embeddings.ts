import { getOpenAI, EMBEDDING_MODEL } from "./openai";

// Batch-embed texts via OpenAI. Returns one 1536-dim vector per input.
export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embed([text]);
  return v;
}

/** pgvector literal for a float array: `[0.1,0.2,...]`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
