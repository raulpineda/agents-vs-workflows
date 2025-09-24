import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const bossFightInputSchema = z.object({
  character: z.string(),
  choices: z.array(z.string()),
  scenarios: z.array(z.string()),
  totalTurns: z.number(),
});

const preparationStep = createStep({
  id: "boss-preparation",
  description: "Prepare for the boss fight",
  inputSchema: bossFightInputSchema,
  outputSchema: z.object({
    character: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    totalTurns: z.number(),
    preparation: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const storyAgent = mastra?.getAgent("storyAgent");
    if (!storyAgent) throw new Error("Story agent not found");

    console.log("\n⚔️ Preparing for the ultimate boss fight...\n");

    const response = await storyAgent.streamVNext([
      {
        role: "user",
        content: `Based on this character's journey, create a dramatic boss encounter setup. Character: ${inputData.character}. Their previous choices: ${inputData.choices.join(", ")}.

Write 2-3 paragraphs:
1. Describe how their adventure has led them to this moment - the culmination of their journey
2. Set the scene for the final boss encounter - the location, atmosphere, and building tension
3. Hint at the approaching boss without revealing it yet

Make it atmospheric and build suspense for the final confrontation.`,
      },
    ]);

    let preparationText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      preparationText += chunk;
    }

    console.log("\n");

    return {
      ...inputData,
      preparation: preparationText,
    };
  },
});

const bossFightStep = createStep({
  id: "boss-fight",
  description: "Face the final boss",
  inputSchema: z.object({
    character: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    totalTurns: z.number(),
    preparation: z.string(),
  }),
  outputSchema: z.object({
    character: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    totalTurns: z.number(),
    preparation: z.string(),
    fightResult: z.string(),
    finalChoice: z.string(),
  }),
  resumeSchema: z.object({
    choice: z.string().describe("Final boss fight choice: A or B"),
  }),
  suspendSchema: z.object({
    bossDescription: z.string(),
    message: z.string(),
  }),
  execute: async ({ inputData, mastra, resumeData, suspend }) => {
    const { choice } = resumeData ?? {};

    if (!choice) {
      const storyAgent = mastra?.getAgent("storyAgent");
      if (!storyAgent) throw new Error("Story agent not found");

      console.log("\n🐉 The final boss appears...\n");

      const response = await storyAgent.streamVNext([
        {
          role: "user",
          content: `Create an epic final boss encounter! Character: ${inputData.character}. Previous journey: ${inputData.choices.join(", ")}.

Write 2-3 paragraphs:
1. Dramatic reveal of the final boss - describe its appearance, power, and connection to the character's journey
2. Describe the initial confrontation and the stakes of this battle
3. Present exactly 2 dramatic final strategies labeled A and B for how to defeat this boss

Make it the climactic moment of the entire adventure!`,
        },
      ]);

      let bossText = "";
      for await (const chunk of response.textStream) {
        process.stdout.write(chunk);
        bossText += chunk;
      }

      console.log("\n");

      return await suspend({
        bossDescription: bossText,
        message: "🔥 FINAL BOSS FIGHT - Choose your strategy: A or B",
      });
    }

    // Player made final choice - resolve the fight
    const storyAgent = mastra?.getAgent("storyAgent");
    if (!storyAgent) throw new Error("Story agent not found");

    console.log(`\n💥 Executing final strategy "${choice}"...\n`);

    const response = await storyAgent.streamVNext([
      {
        role: "user",
        content: `Resolve the boss fight! The player chose strategy "${choice}". Character: ${inputData.character}. Describe the epic battle and decisive victory, but don't write the final conclusion - that will come later. Focus on the action and outcome of this specific boss fight.`,
      },
    ]);

    let fightResult = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      fightResult += chunk;
    }

    console.log("\n");

    return {
      ...inputData,
      fightResult,
      finalChoice: choice,
    };
  },
});

export const bossFightWorkflow = createWorkflow({
  id: "boss-fight-workflow",
  description: "Epic final boss encounter workflow",
  inputSchema: bossFightInputSchema,
  outputSchema: z.object({
    character: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    totalTurns: z.number(),
    preparation: z.string(),
    fightResult: z.string(),
    finalChoice: z.string(),
  }),
})
  .then(preparationStep)
  .then(bossFightStep)
  .commit();
