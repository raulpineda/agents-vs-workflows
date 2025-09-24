// Disable Mastra telemetry warning
(globalThis as any).___MASTRA_TELEMETRY___ = true;

import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { DefaultStorage } from "@mastra/libsql";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { adventureWorkflow } from "./workflows/adventure-workflow";
import { bossFightWorkflow } from "./workflows/boss-fight-workflow";
import { planningAgent } from "./agents/planning-agent";
import { synthesizeAgent } from "./agents/synthesize-agent";
import { characterAgent } from "./agents/character-agent";
import { storyAgent } from "./agents/story-agent";

export const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    adventureWorkflow,
    bossFightWorkflow,
  },
  agents: {
    planningAgent,
    synthesizeAgent,
    characterAgent,
    storyAgent,
  },
  storage: new DefaultStorage({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
