import { GoogleGenAI } from "@google/genai";
import { Release, Resource, Allocation, CONSTANTS } from "../types";
import { calculateMonthlyResourceCostUSD, getMonthList, formatCurrency } from "../utils";

export const generateExecutiveSummary = async (
  release: Release,
  resources: Resource[],
  allocations: Allocation[]
): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key not found. Please configure the environment.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prepare data context
  const months = getMonthList(release.startMonth, release.endMonth);
  let totalCost = 0;
  const resourceSummaries = resources.map(res => {
    let resCost = 0;
    months.forEach(m => {
        const alloc = allocations.find(a => a.resourceId === res.id && a.monthStr === m && a.releaseId === release.id);
        if (alloc) {
            resCost += calculateMonthlyResourceCostUSD(res, alloc.percentage);
        }
    });
    totalCost += resCost;
    return `${res.name} (${res.role}, ${res.location}): ${formatCurrency(resCost, 'USD')}`;
  }).join('\n');

  const prompt = `
    You are a Senior Project Manager Assistant. 
    Analyze the following estimation data for the release "${release.name}".
    
    Start Month: ${release.startMonth}
    End Month: ${release.endMonth}
    Total Estimated Cost: ${formatCurrency(totalCost, 'USD')}
    
    Resource Breakdown:
    ${resourceSummaries}
    
    Please provide a professional Executive Summary (approx 150 words). 
    Highlight the total cost, the primary cost drivers (resources), and any observations about the resource mix (Onsite vs Offshore).
    Keep the tone corporate and concise.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating executive summary. Please check your API key and try again.";
  }
};