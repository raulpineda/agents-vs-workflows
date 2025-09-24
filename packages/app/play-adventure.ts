#!/usr/bin/env node

// Disable Mastra telemetry warning - must be set before any Mastra imports
(globalThis as any).___MASTRA_TELEMETRY___ = true;
import "dotenv/config";
import { createInterface } from "readline/promises";
import { mastra } from "./src/mastra";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printHeader() {
  console.log("\n🎮 ═══════════════════════════════════════");
  console.log("     GENERATE YOUR OWN ADVENTURE");
  console.log("   Building agentic workflows with TypeScript");
  console.log("═══════════════════════════════════════ 🎮\n");
}

function printSeparator() {
  console.log("\n" + "─".repeat(50) + "\n");
}

async function askQuestion(question: string): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

async function playAdventureGame() {
  printHeader();

  // Get character name from user
  const characterName = await askQuestion(
    "Enter your character's name (or press Enter for random): "
  );

  // Ask for number of turns (with default)
  const turnsInput = await askQuestion("How many turns? (2-10, default 3): ");
  const numberOfTurns = turnsInput ? parseInt(turnsInput) || 3 : 3;

  // Ask for city for weather integration
  const cityName = await askQuestion(
    "Enter a city name for weather-based story elements (or press Enter to skip): "
  );

  printSeparator();

  try {
    // Get the workflow from Mastra
    const workflow = mastra.getWorkflow("adventureWorkflow");
    const run = await workflow.createRunAsync();

    // Start the workflow
    let result = await run.start({
      inputData: {
        characterName,
        numberOfTurns: Math.max(2, Math.min(10, numberOfTurns)),
        cityName: cityName || undefined,
      },
    });

    // Game loop - keep playing until complete
    while (result.status === "suspended") {
      printSeparator();

      // Show the scenario from suspend payload
      const suspendInfo = Object.values(result.steps).find(
        (step: any) => step.status === "suspended" && step.suspendPayload
      ) as any;

      if (suspendInfo?.suspendPayload?.message) {
        console.log(`\n${suspendInfo.suspendPayload.message}\n`);
      }

      // Get player choice
      let choice = "";
      while (!choice.match(/^[AaBb]$/)) {
        choice = await askQuestion("Enter your choice (A or B): ");
        if (!choice.match(/^[AaBb]$/)) {
          console.log("Please enter A or B");
        }
      }

      // Resume the workflow with the choice
      result = await run.resume({
        resumeData: {
          choice: choice.toUpperCase(),
        },
      });
    }

    // Show final result
    printSeparator();

    if (result.status === "success") {
      console.log("🎉 Adventure completed successfully!\n");

      if (result.result?.choices) {
        console.log("📝 Your choices:", result.result.choices.join(", "));
      }

      printSeparator();
      console.log("🎮 Thanks for playing!");
    } else {
      console.log("❌ Adventure ended unexpectedly:");
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("💥 Error during adventure:", error);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
  console.log("\n\n👋 Adventure cancelled. Hope to see you again, you coward!");
  rl.close();
  process.exit(0);
});

// Run the game
playAdventureGame().catch((error) => {
  console.error("Fatal error:", error);
  rl.close();
  process.exit(1);
});
