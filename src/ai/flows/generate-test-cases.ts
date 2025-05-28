
'use server';

/**
 * @fileOverview Generates test cases from a user story using the Anthropic SDK directly.
 *
 * - generateTestCases - A function that handles the generation of test cases.
 * - GenerateTestCasesInput - The input type for the generateTestCases function.
 * - GenerateTestCasesOutput - The return type for the generateTestCases function.
 */

import { z } from 'zod';
import { anthropicClient } from '../anthropic-client'; 

// Define the input schema for the generateTestCases function
const GenerateTestCasesInputSchema = z.object({
  storyTitle: z.string().describe('The title of the user story.'),
  acceptanceCriteria: z.string().describe('The acceptance criteria of the user story.'),
  dataDictionary: z.string().optional().describe('The data dictionary for the user story, if available. Should be a string, possibly detailing field names, types, validations, etc.'),
  businessDocumentsText: z.string().optional().describe('Concatenated text content from uploaded business documents, if any.'),
});
export type GenerateTestCasesInput = z.infer<typeof GenerateTestCasesInputSchema>;

// Define the schema for a single test case
const TestCaseSchema = z.object({
  id: z.string().describe('The unique identifier for the test case.'),
  title: z.string().describe('The title of the test case.'),
  priority: z.enum(['High', 'Medium', 'Low']).describe('The priority of the test case.'),
  description: z.string().describe('The numbered list of test case steps. If prerequisites are needed, they should be the initial steps. E.g., "1. Prerequisite: User is logged in. 2. Main step one."'),
  expectedResult: z.string().describe('The expected result of the test case.'),
});
export type TestCase = z.infer<typeof TestCaseSchema>;


// Define the output schema for the generateTestCases function
const GenerateTestCasesOutputSchema = z.array(TestCaseSchema).describe('An array of generated test cases.');
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;

// The detailed prompt template.
const USER_PROMPT_TEMPLATE = `
You are an expert test case generator for Azure DevOps with a focus on comprehensive test coverage. Given a user story title, acceptance criteria, data dictionary (if provided), and supporting business documents (if provided), you will generate a thorough array of test cases in JSON format that covers positive, negative, edge cases, boundary conditions, and data flow testing.

User Story Title: {{{storyTitle}}}
Acceptance Criteria: {{{acceptanceCriteria}}}
Data Dictionary (if available): {{{dataDictionary}}}
Supporting Business Documents Content (if available):
{{{businessDocumentsText}}}

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
- description (as a numbered list of steps. If any prerequisite conditions or setup steps are required before executing the main test actions, include them as initial steps in this numbered list. E.g., "1. Ensure user 'testadmin' exists and is active. 2. Navigate to the admin dashboard. 3. Click on 'Create New User'.")
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
    "description": "1. Ensure user account 'testuser' exists and is active.\\n2. Open the login page.\\n3. Enter valid username 'testuser'.\\n4. Enter valid password for 'testuser'.\\n5. Click the login button.",
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
    "description": "1. User 'dataflow_user' is logged in.\\n2. Navigate to the user profile section.\\n3. Update the user's name and save.\\n4. Logout from the system.\\n5. Login again with 'dataflow_user' credentials.\\n6. Navigate to the user profile section.",
    "expectedResult": "The updated user name should be correctly displayed in the profile, confirming data was properly saved to the database and retrieved upon re-login."
  }
]
`;

const SYSTEM_PROMPT = `You are an expert test case generator for Azure DevOps with a focus on comprehensive test coverage.
Your response MUST be a valid JSON array of test case objects, and nothing else. Do not include any explanatory text before or after the JSON array.
Each test case object in the array must conform to the following structure:
{
  "id": "string",
  "title": "string",
  "priority": "High" | "Medium" | "Low",
  "description": "string", // Numbered list of steps, including any prerequisites as initial steps.
  "expectedResult": "string"
}

Follow all guidelines provided in the user message for test case content and naming conventions. Ensure prerequisites are embedded as initial steps within the 'description' field.

Example (illustrative, ensure your full output matches the detailed guidelines and structure):
[
  {
    "id": "TC-POS-1",
    "title": "[Positive] Verify user can login with valid credentials",
    "priority": "High",
    "description": "1. Ensure user account 'testuser' exists and is active.\\n2. Open the login page.\\n3. Enter valid username 'testuser'.\\n4. Enter valid password for 'testuser'.\\n5. Click the login button.",
    "expectedResult": "User should be logged in successfully and redirected to the dashboard."
  },
  {
    "id": "TC-NEG-USERNAME-1",
    "title": "[Negative] Verify error message for empty username",
    "priority": "High",
    "description": "1. Open the login page.\\n2. Leave username field empty.\\n3. Enter valid password.\\n4. Click the login button.",
    "expectedResult": "An error message 'Username is required' should be displayed. User should remain on the login page."
  }
]
`;

// Basic templating function
function fillPromptTemplate(template: string, data: GenerateTestCasesInput): string {
  let filledTemplate = template;
  filledTemplate = filledTemplate.replace(/{{{storyTitle}}}/g, data.storyTitle || '');
  filledTemplate = filledTemplate.replace(/{{{acceptanceCriteria}}}/g, data.acceptanceCriteria || '');
  
  const dataDictionaryLineRegex = /Data Dictionary \(if available\): {{{dataDictionary}}}\n?/g;
  if (data.dataDictionary && data.dataDictionary.trim() !== '') {
    filledTemplate = filledTemplate.replace(/{{{dataDictionary}}}/g, data.dataDictionary);
  } else {
    filledTemplate = filledTemplate.replace(dataDictionaryLineRegex, '');
  }

  const businessDocumentsLineRegex = /Supporting Business Documents Content \(if available\):\n{{{businessDocumentsText}}}\n?/g;
  if (data.businessDocumentsText && data.businessDocumentsText.trim() !== '') {
    filledTemplate = filledTemplate.replace(/{{{businessDocumentsText}}}/g, data.businessDocumentsText);
  } else {
    // Remove the entire "Supporting Business Documents Content..." section, including its header line
    filledTemplate = filledTemplate.replace(businessDocumentsLineRegex, '');
  }
  return filledTemplate.trim();
}


export async function generateTestCases(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set in environment variables. Please add it to your .env file.');
  }

  const parsedInput = GenerateTestCasesInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error(`Invalid input for generateTestCases: ${parsedInput.error.message}`);
  }

  const userMessageContent = fillPromptTemplate(USER_PROMPT_TEMPLATE, parsedInput.data);

  try {
    const response = await anthropicClient.messages.create({ 
      model: 'claude-sonnet-4-20250514', 
      max_tokens: 4096,
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
        console.error("Anthropic API returned empty or non-text content:", response);
        throw new Error('Anthropic API returned empty or unexpected content format.');
    }
    
    const cleanedJsonString = jsonString.replace(/^```json\s*|\s*```\s*$/g, '').trim();

    let generatedTestCases;
    try {
        generatedTestCases = JSON.parse(cleanedJsonString);
    } catch (parseError) {
        console.error("Failed to parse JSON response from Anthropic:", parseError);
        console.error("Original string from Anthropic:", cleanedJsonString);
        throw new Error(`Failed to parse JSON response from Anthropic. Raw response: ${cleanedJsonString}`);
    }
    
    const validationResult = GenerateTestCasesOutputSchema.safeParse(generatedTestCases);
    if (!validationResult.success) {
      console.error("Anthropic response JSON validation error:", validationResult.error.issues);
      console.error("Problematic data from Anthropic:", generatedTestCases);
      throw new Error(`Anthropic API response does not match the expected schema. Validation issues: ${validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    
    return validationResult.data;

  } catch (error: any) {
    console.error('Error calling Anthropic API or processing response:', error);
    if (error && error.status && error.name) { // Basic check for Anthropic SDK error structure
        throw new Error(`Anthropic API Error: ${error.status} ${error.name} - ${error.message}`);
    }
    if (error instanceof Error) {
        throw error; 
    }
    throw new Error('Failed to generate test cases using Anthropic API due to an unknown error.');
  }
}

