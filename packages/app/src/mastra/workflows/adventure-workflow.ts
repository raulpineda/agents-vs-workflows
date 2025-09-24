import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { bossFightWorkflow } from "./boss-fight-workflow";

const adventureWorkflowSchema = z.object({
  characterName: z.string().describe("The name of the fantasy character"),
  numberOfTurns: z
    .number()
    .min(2)
    .max(10)
    .default(3)
    .describe("Number of story turns"),
  cityName: z.string().optional().describe("Real city name for weather integration"),
});

// Helper function to extract choice descriptions from scenario text
function extractChoiceDescriptions(scenarioText: string): {
  A?: string;
  B?: string;
} {
  const choices: { A?: string; B?: string } = {};

  // Look for patterns like "A. [description]" or "A: [description]" or "**A**" etc.
  const choicePatterns = [
    /(?:^|\n)\s*(?:\*\*)?A[:\.\)]\s*(?:\*\*)?\s*(.+?)(?=\n|$)/gim,
    /(?:^|\n)\s*(?:\*\*)?B[:\.\)]\s*(?:\*\*)?\s*(.+?)(?=\n|$)/gim,
  ];

  const aMatch = choicePatterns[0].exec(scenarioText);
  const bMatch = choicePatterns[1].exec(scenarioText);

  if (aMatch && aMatch[1]) {
    choices.A = aMatch[1].trim();
  }

  if (bMatch && bMatch[1]) {
    choices.B = bMatch[1].trim();
  }

  return choices;
}


const createCharacterStep = createStep({
  id: "create-character",
  description: "Generate character sheet based on name",
  inputSchema: adventureWorkflowSchema,
  outputSchema: z.object({
    character: z.string(),
    turnCount: z.number(),
    totalTurns: z.number(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    lastScenarioText: z.string().optional(),
    cityName: z.string().optional(),
  }),
  execute: async ({ inputData, mastra }) => {
    const characterAgent = mastra?.getAgent("characterAgent");
    if (!characterAgent) throw new Error("Character agent not found");

    const namePrompt = inputData.characterName
      ? `Creating character: ${inputData.characterName}`
      : "Generating random character";

    console.log(`\n🎭 ${namePrompt}...\n`);

    const content = inputData.characterName
      ? `Create a character sheet for the character named: ${inputData.characterName}. DO NOT use the name generator tool since the name is already provided. Use the exact name "${inputData.characterName}" as given.`
      : "Create a character sheet with a randomly generated name. Use the name generator tool to create an appropriate fantasy name first, then build the character around it.";

    const response = await characterAgent.streamVNext([
      {
        role: "user",
        content,
      },
    ]);

    let characterText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      characterText += chunk;
    }

    console.log("\n");

    return {
      character: characterText,
      turnCount: 0,
      totalTurns: inputData.numberOfTurns,
      choices: [],
      scenarios: [],
      lastScenarioText: undefined,
      cityName: inputData.cityName,
    };
  },
});

const scenarioStep = createStep({
  id: "scenario-step",
  description: "Generate scenario and wait for player choice",
  inputSchema: z.object({
    character: z.string(),
    turnCount: z.number(),
    totalTurns: z.number(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    lastScenarioText: z.string().optional(),
    cityName: z.string().optional(),
  }),
  outputSchema: z.object({
    character: z.string(),
    turnCount: z.number(),
    totalTurns: z.number(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    lastScenarioText: z.string().optional(),
    cityName: z.string().optional(),
  }),
  resumeSchema: z.object({
    choice: z.string().describe("Player's choice: A or B"),
  }),
  suspendSchema: z.object({
    scenario: z.string(),
    message: z.string(),
    turnNumber: z.number(),
    totalTurns: z.number(),
  }),
  execute: async ({ inputData, mastra, resumeData, suspend }) => {
    const { choice } = resumeData ?? {};
    const nextTurnCount = inputData.turnCount + 1;

    if (!choice) {
      const storyAgent = mastra?.getAgent("storyAgent");
      if (!storyAgent) throw new Error("Story agent not found");

      console.log(
        `\n🗡️ Generating adventure scenario ${nextTurnCount}/${inputData.totalTurns}...\n`
      );

      const previousContext =
        inputData.scenarios.length > 0
          ? `Previous scenarios and outcomes: ${inputData.scenarios.map((scenario, i) => `Scenario ${i + 1}: ${scenario}. Player chose: ${inputData.choices[i] || "N/A"}`).join(" ")}`
          : "This is the first scenario.";

      const isFirstScenario = inputData.scenarios.length === 0;
      const lastChoice = inputData.choices[inputData.choices.length - 1];

      const cityContext = inputData.cityName
        ? ` Weather context: You may use the weather tool with the city "${inputData.cityName}" to get real weather data for atmospheric storytelling.`
        : " Weather context: Create your own weather descriptions as no real city was provided. Do NOT use the weather tool.";

      const scenarioPrompt = isFirstScenario
        ? `Create turn ${nextTurnCount} adventure scenario for this character. Character info: ${inputData.character}. This is the opening scenario - set the stage for an exciting adventure!${cityContext}

Write 2-3 paragraphs:
- Describe the initial setting and situation
- Present exactly 2 choices labeled A and B with detailed descriptions

Format the choices clearly like:
A: [Detailed description of what this action involves]
B: [Detailed description of what this action involves]

Make sure each choice is specific and actionable so players understand exactly what they're choosing to do.`
        : `Create turn ${nextTurnCount} adventure scenario for this character. Character info: ${inputData.character}. ${previousContext}${cityContext}

Important: The player's last choice was "${lastChoice}". This choice may contain the actual action they took (like "A: negotiate with the goblin"). Use the full context of what they chose, not just the letter.

Write this in 2-3 paragraphs:
1. First paragraph: Describe the outcome and consequences of their previous choice - show specifically how their chosen action played out
2. Second paragraph: Describe the new situation they now find themselves in - what happens next?
3. Present exactly 2 new choices labeled A and B with detailed descriptions

Format the choices clearly like:
A: [Detailed description of what this action involves]
B: [Detailed description of what this action involves]

Make it engaging and show how their previous choice led to this new situation.`;

      const response = await storyAgent.streamVNext([
        {
          role: "user",
          content: scenarioPrompt,
        },
      ]);

      let scenarioText = "";
      for await (const chunk of response.textStream) {
        process.stdout.write(chunk);
        scenarioText += chunk;
      }

      console.log("\n");

      // Store the scenario text in the workflow state for the next iteration
      return await suspend({
        scenario: scenarioText,
        message: `Turn ${nextTurnCount}/${inputData.totalTurns} - Choose your path: A or B`,
        turnNumber: nextTurnCount,
        totalTurns: inputData.totalTurns,
      });
    }

    // Player made a choice - extract choice descriptions from the last scenario text
    const lastScenarioText =
      inputData.lastScenarioText || `Turn ${inputData.turnCount + 1} scenario`;

    // Extract what the choices actually meant from the scenario text
    const choiceDescriptions = extractChoiceDescriptions(lastScenarioText);
    const choiceDescription =
      choiceDescriptions[choice as keyof typeof choiceDescriptions] || choice;

    // Store the full choice with its description for better context
    const enrichedChoice =
      choiceDescription !== choice ? `${choice}: ${choiceDescription}` : choice;

    const newScenarios =
      inputData.scenarios.length === inputData.turnCount
        ? [...inputData.scenarios, lastScenarioText]
        : inputData.scenarios;

    const newChoices = [...inputData.choices, enrichedChoice];

    return {
      character: inputData.character,
      turnCount: nextTurnCount,
      totalTurns: inputData.totalTurns,
      choices: newChoices,
      scenarios: newScenarios,
      lastScenarioText: undefined, // Clear after use
      cityName: inputData.cityName,
    };
  },
});

const conclusionStep = createStep({
  id: "conclusion-step",
  description:
    "Generate final conclusion based on all player choices and boss fight",
  inputSchema: z.object({
    character: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    totalTurns: z.number(),
    bossFightResult: z.any(),
  }),
  outputSchema: z.object({
    conclusion: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const storyAgent = mastra?.getAgent("storyAgent");
    if (!storyAgent) throw new Error("Story agent not found");

    const choicesContext = inputData.choices
      .map((choice, i) => `Turn ${i + 1}: chose ${choice}`)
      .join(", ");

    const bossFightContext = inputData.bossFightResult
      ? `Boss fight: ${inputData.bossFightResult.preparation} ${inputData.bossFightResult.fightResult}`
      : "";

    const response = await storyAgent.streamVNext([
      {
        role: "user",
        content: `Create the final conclusion to this ${inputData.totalTurns}-turn adventure. Character: ${inputData.character}. Player's journey: ${choicesContext}. ${bossFightContext}. Make it an epic, satisfying ending that reflects all their choices and the victorious boss fight!`,
      },
    ]);

    let conclusionText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      conclusionText += chunk;
    }

    console.log("\n\n🎮 Adventure Complete! 🎮\n");

    return {
      conclusion: conclusionText,
    };
  },
});

export const adventureWorkflow = createWorkflow({
  id: "adventure-workflow",
  description:
    "A fantasy choose-your-own-adventure game with dynamic turn-based progression",
  inputSchema: adventureWorkflowSchema,
  outputSchema: z.object({
    character: z.string(),
    conclusion: z.string(),
    choices: z.array(z.string()),
    scenarios: z.array(z.string()),
    bossFight: z.object({
      preparation: z.string(),
      fightResult: z.string(),
      finalChoice: z.string(),
    }),
  }),
})
  .then(createCharacterStep)
  .dountil(
    scenarioStep,
    async ({ inputData }) => inputData.turnCount >= inputData.totalTurns
  )
  .map(async ({ inputData, getStepResult }) => {
    const character = getStepResult(createCharacterStep);
    // Use inputData from the last dountil iteration instead of getStepResult
    return {
      character: character?.character || "",
      choices: inputData.choices || [],
      scenarios: inputData.scenarios || [],
      totalTurns: inputData.totalTurns || 2,
    };
  })
  .then(bossFightWorkflow)
  .map(async ({ inputData, getStepResult }) => {
    const character = getStepResult(createCharacterStep);
    const bossFight = getStepResult(bossFightWorkflow);
    return {
      character: character?.character || "",
      choices: inputData.choices || [],
      scenarios: inputData.scenarios || [],
      totalTurns: inputData.totalTurns || 2,
      bossFightResult: {
        ...bossFight,
        totalTurns: inputData.totalTurns || 2,
      },
    };
  })
  .then(conclusionStep)
  .commit();
