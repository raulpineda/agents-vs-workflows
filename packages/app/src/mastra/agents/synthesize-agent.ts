import { Agent } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const OPENAI_COMPATIBLE_URL = process.env.LOCAL_OPENAI_COMPATIBLE_URL || "";
const OPENAI_COMPATIBLE_MODEL_NAME =
  process.env.LOCAL_OPENAI_COMPATIBLE_MODEL_NAME || "";

const openAICompatible = createOpenAICompatible({
  name: "open-ai-compatible",
  baseURL: OPENAI_COMPATIBLE_URL,
});

export const synthesizeAgent = new Agent({
  name: "synthesize-agent",
  model: openAICompatible(OPENAI_COMPATIBLE_MODEL_NAME),
  instructions: `
  You are given two different blocks of text, one about indoor activities and one about outdoor activities.
  Make this into a full report about the day and the possibilities depending on whether it rains or not.
  `,
});
