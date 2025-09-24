import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    95: "Thunderstorm",
  };
  return conditions[code] || "Unknown";
}

export const weatherTool = createTool({
  id: "weather-forecast",
  description: "Fetch current weather forecast for any city using OpenMeteo API",
  inputSchema: z.object({
    city: z.string().describe("The city to get weather data for"),
  }),
  outputSchema: z.object({
    location: z.string().describe("The actual location name"),
    condition: z.string().describe("Current weather condition"),
    temperature: z.object({
      current: z.number().describe("Current temperature in Celsius"),
      max: z.number().describe("Maximum temperature today"),
      min: z.number().describe("Minimum temperature today"),
    }),
    precipitationChance: z.number().describe("Chance of precipitation as percentage"),
    atmosphere: z.string().describe("Brief atmospheric description for storytelling"),
  }),
  execute: async ({ context }, options) => {
    const { city } = context;

    try {
      // Geocoding to get coordinates
      const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
      const geocodingResponse = await fetch(geocodingUrl);
      const geocodingData = (await geocodingResponse.json()) as {
        results: { latitude: number; longitude: number; name: string }[];
      };

      if (!geocodingData.results?.[0]) {
        // Return fallback data instead of throwing error
        return {
          location: city,
          condition: "Clear sky",
          temperature: {
            current: 15,
            max: 20,
            min: 10,
          },
          precipitationChance: 0,
          atmosphere: "with pleasant, fictional weather perfect for adventure",
        };
      }

      const { latitude, longitude, name } = geocodingData.results[0];

      // Weather data from OpenMeteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,weathercode&hourly=precipitation_probability,temperature_2m&timezone=auto`;
      const response = await fetch(weatherUrl);
      const data = (await response.json()) as {
        current: {
          temperature_2m: number;
          precipitation: number;
          weathercode: number;
        };
        hourly: {
          precipitation_probability: number[];
          temperature_2m: number[];
        };
      };

      // Process the weather data
      const condition = getWeatherCondition(data.current.weathercode);
      const maxTemp = Math.max(...data.hourly.temperature_2m);
      const minTemp = Math.min(...data.hourly.temperature_2m);
      const precipitationChance = data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0
      );

      // Create atmospheric description for storytelling
      const atmosphere = createAtmosphericDescription(condition, data.current.temperature_2m, precipitationChance);

      return {
        location: name,
        condition,
        temperature: {
          current: Math.round(data.current.temperature_2m),
          max: Math.round(maxTemp),
          min: Math.round(minTemp),
        },
        precipitationChance,
        atmosphere,
      };
    } catch (error) {
      // Silently return fallback weather data on any error
      return {
        location: city,
        condition: "Clear sky",
        temperature: {
          current: 15,
          max: 20,
          min: 10,
        },
        precipitationChance: 0,
        atmosphere: "with pleasant weather perfect for adventure",
      };
    }
  },
});

function createAtmosphericDescription(condition: string, temp: number, precipChance: number): string {
  const tempDescriptions = {
    cold: temp < 0 ? "bitterly cold" : temp < 10 ? "chilly" : "cool",
    warm: temp > 30 ? "sweltering" : temp > 20 ? "warm" : "mild",
  };

  const baseTemp = temp < 15 ? tempDescriptions.cold : tempDescriptions.warm;

  const conditionMood = {
    "Clear sky": "with brilliant sunshine",
    "Mainly clear": "with bright, cheerful skies",
    "Partly cloudy": "with drifting clouds overhead",
    "Overcast": "under heavy, grey skies",
    "Foggy": "shrouded in mysterious mist",
    "Light drizzle": "with gentle droplets in the air",
    "Moderate rain": "with steady rainfall",
    "Heavy rain": "with torrential downpour",
    "Thunderstorm": "with dramatic lightning and thunder",
    "Slight snow fall": "with gentle snowflakes falling",
    "Heavy snow fall": "with thick, swirling snow",
  };

  const mood = conditionMood[condition as keyof typeof conditionMood] || "with changeable weather";

  return `${baseTemp} ${mood}`;
}