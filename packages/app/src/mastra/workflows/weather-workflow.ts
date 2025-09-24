import { z } from "zod";
import { createStep, createWorkflow } from "@mastra/core/workflows";

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string(),
});

const fetchWeather = createStep({
  id: "fetch-weather",
  description: "Fetches weather forecast for a given city using weather tool",
  inputSchema: z.object({
    city: z.string(),
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Trigger data not found");
    }

    // Geocoding to get coordinates
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = (await geocodingResponse.json()) as {
      results: { latitude: number; longitude: number; name: string }[];
    };

    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`);
    }

    const { latitude, longitude, name } = geocodingData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
    const response = await fetch(weatherUrl);
    const data = (await response.json()) as {
      current: {
        time: string;
        precipitation: number;
        weathercode: number;
      };
      hourly: {
        precipitation_probability: number[];
        temperature_2m: number[];
      };
    };

    const forecast = {
      date: new Date().toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition(data.current.weathercode),
      location: name,
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0
      ),
    };

    return forecast;
  },
});

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

const planActivities = createStep({
  id: "plan-activities",
  description: "Suggests activities based on weather conditions",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ getInitData, inputData, mastra }) => {
    const { city } = getInitData();
    console.log("planActivities", inputData);
    const forecast = inputData;

    const prompt = `Based on the following weather forecast for ${city}, suggest appropriate activities:
      ${JSON.stringify(forecast, null, 2)}
      `;

    const agent = mastra.getAgent("planningAgent");

    const response = await agent.streamVNext([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let activitiesText = "";

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }

    console.log("planActivities", activitiesText);

    return {
      activities: activitiesText,
    };
  },
});

const planIndoorActivities = createStep({
  id: "plan-indoor-activities",
  description: "Suggests indoor activities based on weather conditions",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ getInitData, inputData, mastra }) => {
    const { city } = getInitData();
    console.log("planIndoorActivities", inputData);
    const forecast = inputData;

    const prompt = `In case it rains, plan indoor activities for ${city} on ${forecast.date}`;

    const agent = mastra.getAgent("planningAgent");

    const response = await agent.streamVNext([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let activitiesText = "";

    for await (const chunk of response.textStream) {
      activitiesText += chunk;
    }

    console.log("planIndoorActivities", activitiesText);
    return {
      activities: activitiesText,
    };
  },
});

const sythesizeStep = createStep({
  id: "sythesize-step",
  description: "Synthesizes the results of the indoor and outdoor activities",
  inputSchema: z.object({
    "plan-activities": z.object({
      activities: z.string(),
    }),
    "plan-indoor-activities": z.object({
      activities: z.string(),
    }),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    console.log("sythesizeStep", inputData);
    const indoorActivities = inputData?.["plan-indoor-activities"];
    const outdoorActivities = inputData?.["plan-activities"];

    const prompt = `Indoor activtities:
      ${indoorActivities?.activities}
      
      Outdoor activities:
      ${outdoorActivities?.activities}
      
      There is a chance of rain so be prepared to do indoor activities if needed.`;

    const agent = mastra.getAgent("synthesizeAgent");

    const response = await agent.streamVNext([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let activitiesText = "";

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }

    console.log("sythesizeStep", activitiesText);
    return {
      activities: activitiesText,
    };
  },
});

const planBothWorkflow = createWorkflow({
  id: "plan-both-workflow",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  steps: [planActivities, planIndoorActivities, sythesizeStep],
})
  .parallel([planActivities, planIndoorActivities])
  .then(sythesizeStep)
  .commit();

const weatherWorkflow = createWorkflow({
  id: "weather-workflow",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
  steps: [fetchWeather, planBothWorkflow, planActivities],
})
  .then(fetchWeather)
  .branch([
    [
      async ({ inputData }) => {
        return inputData?.precipitationChance > 20;
      },
      planBothWorkflow,
    ],
    [
      async ({ inputData }) => {
        return inputData?.precipitationChance <= 20;
      },
      planActivities,
    ],
  ])
  .map({
    activities: {
      step: [planActivities, planBothWorkflow],
      path: "activities",
    },
  });

weatherWorkflow.commit();

export { weatherWorkflow };
