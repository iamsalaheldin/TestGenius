
import type { AzureDevOpsCredentials, UserStory, TestCase, AzureDevOpsWorkItem, AzureDevOpsCreatedWorkItem } from '@/types';

function getAuthHeader(pat: string): Record<string, string> {
  const token = btoa(`:${pat}`);
  return {
    'Authorization': `Basic ${token}`,
  };
}

function htmlToPlainText(html: string): string {
  if (!html) return '';

  let text = html;
  // Convert block elements to newlines first
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/blockquote>|<\/pre>/gi, '\n\n');
  text = text.replace(/<p.*?>|<div.*?>|<h[1-6].*?>|<blockquote>|<pre.*?>/gi, ' ');

  // Handle list items
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<li.*?>/gi, '\n• ');

  // Strip all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  text = text.replace(/(\n\s*){2,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n\n• /g, '\n• ');

  return text.trim();
}

export async function fetchUserStoryById(
  storyId: string,
  creds: AzureDevOpsCredentials
): Promise<UserStory> {
  const { organizationUrl, projectName, pat } = creds;
  const encodedProjectName = encodeURIComponent(projectName);
  const url = `${organizationUrl}/${encodedProjectName}/_apis/wit/workitems/${storyId}?api-version=6.0`;

  const response = await fetch(url, {
    headers: {
      ...getAuthHeader(pat),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your PAT and permissions.');
    }
    if (response.status === 404) {
      throw new Error(`User Story with ID "${storyId}" not found in project "${projectName}". Ensure Organization URL, Project Name, and Story ID are correct.`);
    }
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to fetch user story: ${errorData.message || response.statusText}`);
  }

  const data: AzureDevOpsWorkItem = await response.json();

  const title = data.fields['System.Title'];
  const descriptionHtml = data.fields['System.Description'] || '';
  const acceptanceCriteriaHtml = data.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';

  if (!title) {
    throw new Error('User story title is missing.');
  }

  const description = htmlToPlainText(descriptionHtml);
  const acceptanceCriteria = htmlToPlainText(acceptanceCriteriaHtml);

  return {
    id: storyId,
    title,
    description,
    acceptanceCriteria,
    url: (data as any)._links?.html?.href || (data as any).url,
  };
}

// Removed fetchAuthenticatedUserDetails function as per user request

function mapPriorityToAzureDevOps(priority: 'High' | 'Medium' | 'Low'): 1 | 2 | 3 {
  switch (priority) {
    case 'High': return 1;
    case 'Medium': return 2;
    case 'Low': return 3;
    default: return 2;
  }
}

function escapeHtml(unsafe: string | undefined): string {
  if (unsafe === undefined) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function prepareContentForXml(text: string | undefined): string {
  if (text === undefined) return "";
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return ""; 
  }
  const contentWithBreaks = trimmedText.replace(/\n/g, '<br />');
  return escapeHtml(contentWithBreaks);
};


function generateStepsXml(description: string | undefined, overallExpectedResult: string | undefined): string {
  const cleanedDescription = description ? description.trim() : "";
  const cleanedExpectedResult = overallExpectedResult ? overallExpectedResult.trim() : "";

  let stepsArray = cleanedDescription
    .split('\n')
    .map(step => step.trim())
    .map(step => step.replace(/^\d+\.\s*/, '').trim())
    .filter(step => step.length > 0);

  if (stepsArray.length === 0 && cleanedExpectedResult.length > 0) {
    stepsArray = ["Verify expected result."]; // Create a generic step if only expected result exists
  }
  
  if (stepsArray.length === 0) {
    return ""; 
  }

  const stepXmlParts = stepsArray.map((stepAction, index) => {
    const stepNumber = index + 1;
    const actionContent = prepareContentForXml(stepAction);
    
    let stepExpectedResultText = "";
    if (stepNumber === stepsArray.length && cleanedExpectedResult.length > 0) {
      stepExpectedResultText = cleanedExpectedResult;
    }
    const expectedResultContent = prepareContentForXml(stepExpectedResultText);
    
    return `<step id="${stepNumber}" type="ActionStep"><parameterizedString isformatted="true">${actionContent}</parameterizedString><parameterizedString isformatted="true">${expectedResultContent}</parameterizedString></step>`;
  });

  return `<steps id="0" last="${stepXmlParts.length}">${stepXmlParts.join('')}</steps>`;
}


export async function uploadTestCaseToAzureDevOps(
  testCase: TestCase,
  planId: string,
  suiteId: string,
  creds: AzureDevOpsCredentials
): Promise<AzureDevOpsCreatedWorkItem> {
  const { organizationUrl, projectName, pat } = creds;
  const encodedProjectName = encodeURIComponent(projectName);
  
  const createWorkItemUrl = `${organizationUrl}/${encodedProjectName}/_apis/wit/workitems/$Test%20Case?api-version=7.1`;

  const stepsXml = generateStepsXml(testCase.description, testCase.expectedResult);

  const workItemBody: any[] = [
    { "op": "add", "path": "/fields/System.Title", "value": `${testCase.id}: ${testCase.title}` },
    { "op": "add", "path": "/fields/Microsoft.VSTS.Common.Priority", "value": mapPriorityToAzureDevOps(testCase.priority) },
  ];

  if (stepsXml) {
    workItemBody.push({
      "op": "add",
      "path": "/fields/Microsoft.VSTS.TCM.Steps",
      "value": stepsXml
    });
  }
  
  const createResponse = await fetch(createWorkItemUrl, {
    method: 'POST',
    headers: {
      ...getAuthHeader(pat),
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(workItemBody),
  });

  if (!createResponse.ok) {
    let apiErrorMessage = createResponse.statusText;
    let userHint = "";
    try {
      const errorData = await createResponse.json();
      if (errorData && errorData.message) {
        apiErrorMessage = errorData.message;
      }
    } catch (e) {
      // Failed to parse JSON, stick with statusText
    }

    if (createResponse.status === 404) {
      userHint = ` This typically means the Organization URL ('${organizationUrl}') or Project Name ('${projectName}') in your credentials is incorrect, the API endpoint for creating test cases was not found, or the Azure DevOps project itself cannot be found. Please verify these in your authentication settings and in Azure DevOps.`;
    } else if (createResponse.status === 401) {
      userHint = ` Authentication failed. Please check your Personal Access Token (PAT) and ensure it's valid and has 'Work Items (read & write)' permissions.`;
    } else if (createResponse.status === 403) {
      userHint = ` Authorization failed. Your PAT may not have sufficient permissions for this project or to create work items. Ensure it has 'Work Items (read & write)' scope.`;
    } else {
      userHint = ` Please check your network connection and Azure DevOps service status.`
    }
    
    throw new Error(`Failed to create test case work item "${testCase.title}": ${apiErrorMessage || 'Error'} (Status: ${createResponse.status}).${userHint}`);
  }

  const createdWorkItem = await createResponse.json() as AzureDevOpsCreatedWorkItem;
  
  const addToSuiteUrl = `${organizationUrl}/${encodedProjectName}/_apis/test/Plans/${planId}/suites/${suiteId}/testcases/${createdWorkItem.id}?api-version=7.1`;
  
  const suiteResponse = await fetch(addToSuiteUrl, {
    method: 'POST',
    headers: {
      ...getAuthHeader(pat),
    },
    // No body for this specific POST request
  });

  if (!suiteResponse.ok) {
    let apiErrorMessage = suiteResponse.statusText; 
    if (suiteResponse.headers.get("content-type")?.includes("application/json")) {
        try {
            const errorJson = await suiteResponse.json();
            if (errorJson && errorJson.message) {
                apiErrorMessage = errorJson.message;
            }
        } catch (e) {
            console.error("Failed to parse error JSON from Azure DevOps when adding to suite:", e);
        }
    }

    let userHint = "";
     if (suiteResponse.status === 404) {
        userHint = ` This often means the Test Plan ID ('${planId}') or Test Suite ID ('${suiteId}') is incorrect for project '${encodedProjectName}', the suite doesn't belong to the specified plan, or the API endpoint/version is not found. Crucially, ensure the Test Suite ID ('${suiteId}') refers to a STATIC test suite. Test cases cannot be manually added to query-based or requirement-based suites using this API. Also, verify your PAT has 'Test Management (read & write)' permissions. Please verify these details and their relationship in Azure DevOps. ADO Message: '${apiErrorMessage}'`;
    } else if (suiteResponse.status === 401 || suiteResponse.status === 403) {
        userHint = ` This could be a permission issue with your PAT. Ensure it has 'Test Management (read & write)' scopes. ADO Message: '${apiErrorMessage}'`;
    } else if (suiteResponse.status === 400) {
         userHint = ` This might indicate an invalid request format or invalid IDs (API version: 7.1). ADO Message: '${apiErrorMessage}'`;
    } else {
        userHint = ` ADO Message: '${apiErrorMessage}'`;
    }
    
    throw new Error(`Test case ${createdWorkItem.id} created, but failed to add to Test Suite ${suiteId} in Plan ${planId}. (Status: ${suiteResponse.status}).${userHint}`);
  }
  
  return createdWorkItem;
}
