
'use server';

/**
 * @fileOverview Summarizes the test case generation results using the Anthropic SDK.
 *
 * - summarizeTestCaseGenerationResults - A function that summarizes the test case generation results.
 * - SummarizeTestCaseGenerationResultsInput - The input type for the summarizeTestCaseGenerationResults function.
 * - SummarizeTestCaseGenerationResultsOutput - The return type for the summarizeTestCaseGenerationResults function.
 */

import { z } from 'zod';
import { anthropicClient } from '../anthropic-client'; // Using shared client

const SummarizeTestCaseGenerationResultsInputSchema = z.object({
  successCount: z.number().describe('The number of test cases successfully generated.'),
  failureCount: z.number().describe('The number of test cases that failed to generate.'),
  errorMessages: z.array(z.string()).describe('A list of error messages encountered during test case generation.'),
});
export type SummarizeTestCaseGenerationResultsInput = z.infer<typeof SummarizeTestCaseGenerationResultsInputSchema>;

const SummarizeTestCaseGenerationResultsOutputSchema = z.object({
  summary: z.string().describe('A summary of the test case generation results, highlighting successes and failures.'),
  progress: z.string().describe('One-sentence summary of what was generated.'),
});
export type SummarizeTestCaseGenerationResultsOutput = z.infer<typeof SummarizeTestCaseGenerationResultsOutputSchema>;

const SYSTEM_PROMPT = `You are an AI assistant that summarizes test case generation results.
Your response MUST be a valid JSON object conforming to the following structure, and nothing else. Do not include any explanatory text before or after the JSON object.
{
  "summary": "string (A concise summary of the test case generation results, highlighting successes and failures. No more than two sentences long.)",
  "progress": "string (One-sentence summary of what was generated, indicating the progress made during generation.)"
}

Follow the instructions in the user message to generate the content for the 'summary' and 'progress' fields.
`;

export async function summarizeTestCaseGenerationResults(input: SummarizeTestCaseGenerationResultsInput): Promise<SummarizeTestCaseGenerationResultsOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables. Please add it to your .env file.');
  }

  const parsedInput = SummarizeTestCaseGenerationResultsInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error(`Invalid input for summarizeTestCaseGenerationResults: ${parsedInput.error.message}`);
  }

  let userMessageContent = `
Here's a summary of test case generation:
- Successfully Generated: ${parsedInput.data.successCount}
- Failed to Generate: ${parsedInput.data.failureCount}
`;

  if (parsedInput.data.errorMessages && parsedInput.data.errorMessages.length > 0) {
    userMessageContent += `\nThe following errors occurred:\n`;
    parsedInput.data.errorMessages.forEach(error => {
      userMessageContent += `- ${error}\n`;
    });
  }

  userMessageContent += `
Please provide a concise summary of the test case generation results, highlighting any errors or warnings.
The summary should be no more than two sentences long.
Also, provide a one-sentence summary of what was generated that indicates the progress made during generation.
`;

  try {
    const response = await anthropicClient.messages.create({ // Using shared client
      model: 'claude-sonnet-4-20250514', 
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userMessageContent,
        },
      ],
    });

    let jsonString = '';
    if (response.content && response.content.length > 0) {
        const textBlock = response.content.find(block => block.type === 'text');
        if (textBlock) {
            jsonString = textBlock.text;
        }
    }

    if (!jsonString) {
        console.error("Anthropic API returned empty or non-text content for summary:", response);
        throw new Error('Anthropic API returned empty or unexpected content format for summary.');
    }
    
    const cleanedJsonString = jsonString.replace(/^```json\s*|\s*```\s*$/g, '').trim();

    let summaryOutput;
    try {
        summaryOutput = JSON.parse(cleanedJsonString);
    } catch (parseError) {
        console.error("Failed to parse JSON response from Anthropic for summary:", parseError);
        console.error("Original string from Anthropic for summary:", cleanedJsonString);
        throw new Error(`Failed to parse JSON response from Anthropic for summary. Raw response: ${cleanedJsonString}`);
    }
    
    const validationResult = SummarizeTestCaseGenerationResultsOutputSchema.safeParse(summaryOutput);
    if (!validationResult.success) {
      console.error("Anthropic summary response JSON validation error:", validationResult.error.issues);
      console.error("Problematic summary data from Anthropic:", summaryOutput);
      throw new Error(`Anthropic API summary response does not match the expected schema. Validation issues: ${validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    
    return validationResult.data;

  } catch (error: any) {
    console.error('Error calling Anthropic API or processing summary response:', error);
    if (error && error.status && error.name) { // Basic check for Anthropic SDK error structure
        throw new Error(`Anthropic API Error during summary: ${error.status} ${error.name} - ${error.message}`);
    }
    if (error instanceof Error) {
        throw error; 
    }
    throw new Error('Failed to generate summary using Anthropic API due to an unknown error.');
  }
}

