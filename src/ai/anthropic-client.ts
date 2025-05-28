
/**
 * @fileOverview Initializes and exports a shared Anthropic SDK client instance.
 */

import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  // This check will run when the module is first loaded on the server.
  // If the key is missing during an API call, the SDK itself will also throw an error.
  console.warn('ANTHROPIC_API_KEY is not set in environment variables. API calls to Anthropic will fail.');
}

export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // The SDK will throw an error if this is undefined during an API call.
});
