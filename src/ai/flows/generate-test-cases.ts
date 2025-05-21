
'use server';

/**
 * @fileOverview Generates test cases from a user story using AI.
 *
 * - generateTestCases - A function that handles the generation of test cases.
 * - GenerateTestCasesInput - The input type for the generateTestCases function.
 * - GenerateTestCasesOutput - The return type for the generateTestCases function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTestCasesInputSchema = z.object({
  storyTitle: z.string().describe('The title of the user story.'),
  storyDescription: z.string().optional().describe('The detailed description of the user story, if available.'),
  acceptanceCriteria: z.string().describe('The acceptance criteria of the user story.'),
  dataDictionary: z.string().optional().describe('The data dictionary for the user story, if available. Should be a string, possibly detailing field names, types, validations, etc.'),
});
export type GenerateTestCasesInput = z.infer<typeof GenerateTestCasesInputSchema>;

const TestCaseSchema = z.object({
  id: z.string().describe('The unique identifier for the test case.'),
  title: z.string().describe('The title of the test case.'),
  priority: z.enum(['High', 'Medium', 'Low']).describe('The priority of the test case.'),
  description: z.string().describe('The numbered list of test case steps. Each step should start with a number followed by a period and a space (e.g., "1. Do this.").'),
  expectedResult: z.string().describe('The expected result of the test case.'),
});

const GenerateTestCasesOutputSchema = z.array(TestCaseSchema).describe('An array of generated test cases.');
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;

export async function generateTestCases(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  return generateTestCasesFlow(input);
}

const generateTestCasesPrompt = ai.definePrompt({
  name: 'generateTestCasesPrompt',
  input: {schema: GenerateTestCasesInputSchema},
  output: {schema: GenerateTestCasesOutputSchema},
  prompt: `You are an expert test case generator for Azure DevOps with a focus on comprehensive test coverage. Given a user story title, description (if available), acceptance criteria, and data dictionary (if provided), you will generate a thorough array of test cases in JSON format that covers positive, negative, edge cases, boundary conditions, and data flow testing.

User Story Title: {{{storyTitle}}}
User Story Description (if available): {{{storyDescription}}}
Acceptance Criteria: {{{acceptanceCriteria}}}
Data Dictionary (if available): {{{dataDictionary}}}

Generate test cases following these guidelines:

1. SEPARATE TEST CONDITIONS:
   - Create separate test cases for each test condition
   - Never combine multiple test conditions in a single test case
   - Each test case should focus on verifying exactly ONE condition or scenario

2. DATA DICTIONARY COVERAGE:
   - If a data dictionary is provided, create test cases for EVERY item in the dictionary
   - For each data field, create tests that verify:
     * Valid inputs are accepted
     * Invalid inputs are rejected with appropriate messages
     * Required fields cannot be empty
     * Optional fields can be left empty
     * Field-specific validations work as expected

3. POSITIVE TEST CASES:
   - Verify the core functionality works as expected under normal conditions
   - Include at least 3-5 positive test cases that validate primary user flows
   - Cover all acceptance criteria with at least one positive test case
   - Test each valid input scenario separately

4. NEGATIVE TEST CASES:
   - Include scenarios where inputs are invalid, missing, or unexpected
   - Create SEPARATE test cases for each type of invalid input
   - Test error handling and validation mechanisms
   - Verify appropriate error messages are displayed when failures occur
   - Include at least 3-5 negative test cases

5. EDGE CASES:
   - Test boundary conditions (min/max values, empty sets, etc.)
   - Include scenarios with unexpected user behavior
   - Test performance under special circumstances (e.g., large data sets)
   - Include at least 2-3 edge cases
   - Create separate test cases for each boundary condition

6. DATA FLOW TESTING:
   - Verify how data moves through the system from input to storage and output
   - Create test cases that track data through the entire system workflow
   - Verify data integrity is maintained throughout the process
   - Test data transformations between different system components
   - Test data persistence and retrieval operations
   - Include at least 3-4 data flow test cases

7. INTEGRATION POINTS:
   - Test how the feature interacts with other components or systems
   - Verify data flow between integrated components
   - Include at least 1-2 integration test cases if applicable

Each test case should have:
- id (e.g., "TC-POS-1", "TC-NEG-1", "TC-EDGE-1", "TC-DF-1")
- title (clear and descriptive, including the type of test)
- priority (High, Medium, or Low)
- description (as a numbered list of steps, e.g., "1. Step one.\\n2. Step two.")
- expectedResult (specific and verifiable outcome)

Test case naming convention should follow:
- Positive test cases: TC-POS-[number]
- Negative test cases: TC-NEG-[number]
- Edge cases: TC-EDGE-[number]
- Data flow test cases: TC-DF-[number]
- Integration test cases: TC-INT-[number]
- For data dictionary items: TC-[type]-[field]-[number] (e.g., TC-POS-USERNAME-1)

Ensure the output is a valid JSON array of test cases.

Example (illustrative, follow all guidelines above for full output):
[
  {
    "id": "TC-POS-1",
    "title": "[Positive] Verify user can login with valid credentials",
    "priority": "High",
    "description": "1. Open the login page.\\n2. Enter valid username.\\n3. Enter valid password.\\n4. Click the login button.",
    "expectedResult": "User should be logged in successfully and redirected to the dashboard."
  },
  {
    "id": "TC-NEG-USERNAME-1",
    "title": "[Negative] Verify error message for empty username",
    "priority": "High",
    "description": "1. Open the login page.\\n2. Leave username field empty.\\n3. Enter valid password.\\n4. Click the login button.",
    "expectedResult": "An error message 'Username is required' should be displayed. User should remain on the login page."
  },
  {
    "id": "TC-EDGE-USERNAME-1",
    "title": "[Edge] Verify login with username at maximum character limit",
    "priority": "Medium",
    "description": "1. Open the login page.\\n2. Enter a username that is exactly at the maximum allowed character limit (e.g., 50 characters).\\n3. Enter a valid password.\\n4. Click the login button.",
    "expectedResult": "User should be logged in successfully."
  },
  {
    "id": "TC-DF-1",
    "title": "[Data Flow] Verify user profile data is correctly saved and retrieved",
    "priority": "High",
    "description": "1. Login with valid credentials.\\n2. Navigate to the user profile section.\\n3. Update the user's name and save.\\n4. Logout from the system.\\n5. Login again with the same credentials.\\n6. Navigate to the user profile section.",
    "expectedResult": "The updated user name should be correctly displayed in the profile, confirming data was properly saved to the database and retrieved upon re-login."
  }
]
`,
});

const generateTestCasesFlow = ai.defineFlow(
  {
    name: 'generateTestCasesFlow',
    inputSchema: GenerateTestCasesInputSchema,
    outputSchema: GenerateTestCasesOutputSchema,
  },
  async input => {
    const {output} = await generateTestCasesPrompt(input);
    return output!;
  }
);
