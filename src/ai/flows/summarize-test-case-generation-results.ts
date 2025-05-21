'use server';

/**
 * @fileOverview Summarizes the test case generation results, highlighting any errors or warnings.
 *
 * - summarizeTestCaseGenerationResults - A function that summarizes the test case generation results.
 * - SummarizeTestCaseGenerationResultsInput - The input type for the summarizeTestCaseGenerationResults function.
 * - SummarizeTestCaseGenerationResultsOutput - The return type for the summarizeTestCaseGenerationResults function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

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

export async function summarizeTestCaseGenerationResults(input: SummarizeTestCaseGenerationResultsInput): Promise<SummarizeTestCaseGenerationResultsOutput> {
  return summarizeTestCaseGenerationResultsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeTestCaseGenerationResultsPrompt',
  input: {schema: SummarizeTestCaseGenerationResultsInputSchema},
  output: {schema: SummarizeTestCaseGenerationResultsOutputSchema},
  prompt: `You are an AI assistant that summarizes test case generation results.

  Here's a summary of test case generation:
  - Successfully Generated: {{successCount}}
  - Failed to Generate: {{failureCount}}

  {% if errorMessages.length > 0 %}
  The following errors occurred:
  {% each errorMessages %}
  - {{this}}
  {% endeach %}
  {% endif %}

  Please provide a concise summary of the test case generation results, highlighting any errors or warnings.
  The summary should be no more than two sentences long.
  Also, make sure to indicate the progress made during generation.
  `,
});

const summarizeTestCaseGenerationResultsFlow = ai.defineFlow(
  {
    name: 'summarizeTestCaseGenerationResultsFlow',
    inputSchema: SummarizeTestCaseGenerationResultsInputSchema,
    outputSchema: SummarizeTestCaseGenerationResultsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return {
      ...output!,
      progress: 'Generated a summary of test case generation results, highlighting any errors or warnings.',
    };
  }
);
