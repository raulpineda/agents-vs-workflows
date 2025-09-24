import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const nameGeneratorTool = createTool({
  id: "fantasy-name-generator",
  description:
    "Generate fantasy character names using external API for various ancestries and genders",
  inputSchema: z.object({
    ancestry: z
      .enum(["human", "dwarf", "elf", "orc"])
      .default("human")
      .describe("Character ancestry/race"),
    gender: z
      .enum(["male", "female", "random"])
      .default("random")
      .describe("Character gender"),
    includeFamily: z
      .boolean()
      .default(true)
      .describe("Whether to include a family/surname"),
  }),
  outputSchema: z.object({
    name: z.string().describe("Generated fantasy character name"),
    ancestry: z.string().describe("Character ancestry used for generation"),
    gender: z
      .string()
      .describe(
        "Gender used for generation (if random was selected, shows actual result)"
      ),
    description: z.string().describe("Brief description of the generated name"),
  }),
  execute: async ({ context }) => {
    const { ancestry, gender, includeFamily } = context;

    // Map our enum values to API parameters
    const ancestryMap = {
      human: "h",
      dwarf: "d",
      elf: "e",
      orc: "o",
    };

    const genderMap = {
      male: "m",
      female: "f",
      random: undefined, // Let API choose randomly
    };

    // Build API parameters
    const params = new URLSearchParams();
    params.append("ancestry", ancestryMap[ancestry]);

    const genderParam = genderMap[gender];
    if (genderParam) {
      params.append("gender", genderParam);
    }

    if (includeFamily) {
      params.append("family", "t");
    }

    // Call the fantasy name API
    const apiUrl = `https://fantasyname.lukewh.com/?${params.toString()}`;

    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Name API returned ${response.status}`);
      }

      const generatedName = (await response.text()).trim();

      if (!generatedName) {
        throw new Error("API returned empty name");
      }

      // Determine actual gender used (for random selection)
      const actualGender = gender === "random" ? "randomly chosen" : gender;

      // Create description
      const ancestryName = ancestry.charAt(0).toUpperCase() + ancestry.slice(1);
      const familyText = includeFamily ? "with surname" : "first name only";
      const description = `${ancestryName} ${actualGender} name (${familyText})`;

      return {
        name: generatedName,
        ancestry,
        gender: actualGender,
        description,
      };
    } catch (error) {
      console.log(error);
      // Fallback names if API fails
      let genderKey;
      if (gender === "random") {
        genderKey = Math.random() > 0.5 ? "male" : "female";
      } else {
        genderKey = gender;
      }

      const fallbackName = genderKey === "male" ? "Bob" : "Bertha";

      const ancestryName = ancestry.charAt(0).toUpperCase() + ancestry.slice(1);
      const description = `${ancestryName} ${genderKey} name (fallback)`;

      return {
        name: fallbackName,
        ancestry,
        gender: genderKey,
        description,
      };
    }
  },
});
