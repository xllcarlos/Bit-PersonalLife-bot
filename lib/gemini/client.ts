import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!config.gemini.apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined.");
    }
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}
