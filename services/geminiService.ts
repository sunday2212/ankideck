
import { GoogleGenAI, Type } from "@google/genai";

export const generateCardsFromText = async (text: string): Promise<{ front: string; back: string }[]> => {
  // Use process.env.API_KEY directly as per the @google/genai guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following text and generate a list of concise Anki-style flashcards (Front/Back pairs). Focus on key concepts, definitions, and facts. Output should be JSON.
    Text: ${text}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING }
          },
          required: ["front", "back"]
        }
      }
    }
  });

  try {
    // Access response.text as a property (not a method). Handle potential undefined.
    const jsonStr = (response.text || "[]").trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};
