
export interface AzureDevOpsCredentials {
  organizationUrl: string;
  projectName: string;
  pat: string;
}

export interface UserStory {
  id: string;
  title: string;
  description?: string;
  acceptanceCriteria: string;
  url: string;
}

export interface TestCase {
  id: string; // Temporary ID, e.g., TC-1, TC-2
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  // prerequisites field removed
  description: string; // Steps, may now include prerequisites as initial steps
  expectedResult: string;
  azureDevOpsId?: number; // Populated after upload
  azureDevOpsUrl?: string; // Populated after upload
  uploadStatus?: 'pending' | 'success' | 'failed';
  uploadError?: string;
}

export type AzureDevOpsWorkItem = {
  id: number;
  rev: number;
  fields: {
    'System.Id': number;
    'System.Title': string;
    'System.Description'?: string;
    'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
    // Other fields can be added if needed
  };
  url: string;
};

export type AzureDevOpsCreatedWorkItem = {
  id: number;
  url: string;
  fields: {
    "System.Title": string;
  };
  // Other fields returned by Azure DevOps API
};

