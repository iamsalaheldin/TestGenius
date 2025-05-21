
"use client";

import { generateTestCases } from '@/ai/flows/generate-test-cases';
import { AuthModal } from '@/components/auth-modal';
import { LoadingSpinner } from '@/components/loading-spinner';
import { TestCaseList } from '@/components/test-case-list';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel as RHFFormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCredentials } from '@/contexts/credentials-context';
import { useToast } from '@/hooks/use-toast';
import { fetchUserStoryById, uploadTestCaseToAzureDevOps } from '@/lib/azure-devops-api';
import type { AzureDevOpsCredentials, TestCase, UserStory } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, FolderSearch, LogIn, UploadCloud, Sparkles, PlusCircle, FileDown, ListChecks, ClipboardList } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';

const storyIdSchema = z.object({
  storyId: z.string().min(1, { message: "User Story ID is required." }).regex(/^\d+$/, { message: "Story ID must be a number." }),
});
type StoryIdFormData = z.infer<typeof storyIdSchema>;

export default function HomePage() {
  const { credentials, setCredentials, isLoading: credentialsLoading } = useCredentials();
  const { toast } = useToast();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  
  const [userStory, setUserStory] = useState<UserStory | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [manualTestCaseCounter, setManualTestCaseCounter] = useState(1);
  
  const [isFetchingStory, setIsFetchingStory] = useState(false);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [isUploadingTests, setIsUploadingTests] = useState(false);
  const [uploadingTestCaseIds, setUploadingTestCaseIds] = useState<string[]>([]);

  const [testPlanId, setTestPlanId] = useState<string>('');
  const [testSuiteId, setTestSuiteId] = useState<string>('');
  const [isGenerateConfirmationOpen, setIsGenerateConfirmationOpen] = useState(false);


  const storyIdForm = useForm<StoryIdFormData>({
    resolver: zodResolver(storyIdSchema),
    defaultValues: { storyId: '' },
  });

  useEffect(() => {
    if (!credentialsLoading && !credentials) {
      setIsAuthModalOpen(true);
    }
  }, [credentials, credentialsLoading]);

  const handleAuthentication = (creds: AzureDevOpsCredentials) => {
    setCredentials(creds);
    toast({ title: "Authenticated", description: "Credentials saved successfully." });
  };

  const handleFetchStory = async (data: StoryIdFormData) => {
    if (!credentials || !credentials.organizationUrl || !credentials.projectName || !credentials.pat) {
      toast({ variant: "destructive", title: "Authentication Incomplete", description: "Please re-authenticate with valid Azure DevOps details." });
      setIsAuthModalOpen(true);
      return;
    }
    setIsFetchingStory(true);
    setUserStory(null); 
    setTestCases([]); 
    setManualTestCaseCounter(1); 
    try {
      const story = await fetchUserStoryById(data.storyId, credentials);
      setUserStory(story);
      toast({ title: "Story Fetched", description: `Successfully fetched "${story.title}".` });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ variant: "destructive", title: "Fetch Error", description: errorMessage });
      if (errorMessage.includes("Authentication failed")) {
        setCredentials(null); 
        setIsAuthModalOpen(true);
      }
    } finally {
      setIsFetchingStory(false);
    }
  };

  const performAiGeneration = async (mode: 'append' | 'override') => {
    if (!userStory) {
      toast({ variant: "destructive", title: "No Story", description: "Please fetch a user story first." });
      return;
    }
    setIsGeneratingTests(true);
    setIsGenerateConfirmationOpen(false); 
    try {
      const generated = await generateTestCases({
        storyTitle: userStory.title,
        storyDescription: userStory.description,
        acceptanceCriteria: userStory.acceptanceCriteria,
        // dataDictionary: "" // Add UI for this when ready
      });

      if (mode === 'append') {
        setTestCases(prev => {
          const manualCases = prev.filter(tc => tc.id.startsWith("MANUAL-"));
          const existingAiCases = prev.filter(tc => !tc.id.startsWith("MANUAL-"));
          
          const newAiCasesMap = new Map(generated.map(tc => [tc.id, {...tc, uploadStatus: 'pending'} as TestCase]));
          
          const updatedAiCases = existingAiCases.map(tc => newAiCasesMap.get(tc.id) || tc);
          
          const finalAiCases = Array.from(new Map([...updatedAiCases, ...Array.from(newAiCasesMap.values())].map(tc => [tc.id, tc])).values());

          return [...manualCases, ...finalAiCases];
        });
      } else { 
        setTestCases(prev => [
          ...prev.filter(tc => tc.id.startsWith("MANUAL-")), 
          ...generated.map(tc => ({ ...tc, uploadStatus: 'pending' } as TestCase))
        ]);
      }
      toast({ title: "Test Cases Generated", description: `Generated ${generated.length} new test cases.` });
    } catch (error) {
      console.error("AI Generation Error:", error);
      const errorMessage = error instanceof Error ? error.message : "AI generation failed.";
      toast({ variant: "destructive", title: "AI Error", description: errorMessage });
    } finally {
      setIsGeneratingTests(false);
    }
  };

  const handleGenerateTestCases = async () => {
    if (!userStory) {
      toast({ variant: "destructive", title: "No Story", description: "Please fetch a user story first." });
      return;
    }
    const existingAiCases = testCases.filter(tc => !tc.id.startsWith("MANUAL-"));
    if (existingAiCases.length > 0) {
      setIsGenerateConfirmationOpen(true);
    } else {
      await performAiGeneration('override'); 
    }
  };

  const handleAddManualTestCase = () => {
    const newId = `MANUAL-${manualTestCaseCounter}`;
    const newTestCase: TestCase = {
      id: newId,
      title: `Manual Test Case ${manualTestCaseCounter}`,
      priority: 'Medium',
      description: '',
      expectedResult: '',
      uploadStatus: 'pending',
    };
    setTestCases(prev => [...prev, newTestCase]);
    setManualTestCaseCounter(prev => prev + 1);
    toast({ title: "Manual Test Case Added", description: `${newId} is ready for editing.` });
  };

  const handleUpdateTestCase = (updatedTC: TestCase) => {
    setTestCases(prev => prev.map(tc => tc.id === updatedTC.id ? updatedTC : tc));
  };

  const handleDeleteTestCase = (testCaseId: string) => {
    setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
  };

  const escapeCsvValue = (value: string | number | undefined): string => {
    if (value === undefined || value === null) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const handleDownloadCsv = () => {
    if (testCases.length === 0) {
      toast({ variant: "destructive", title: "No Test Cases", description: "There are no test cases to download." });
      return;
    }

    let csvContent = "Work Item Type,Title,Step Action,Step Expected Result\n";

    testCases.forEach(tc => {
      const steps = tc.description.split('\n').map(s => s.replace(/^\d+\.\s*/, '').trim()).filter(s => s);
      
      if (steps.length === 0) {
        csvContent += `${escapeCsvValue("Test Case")},${escapeCsvValue(tc.title)},${escapeCsvValue("")},${escapeCsvValue(tc.expectedResult)}\n`;
      } else {
        steps.forEach((step, index) => {
          const workItemType = index === 0 ? "Test Case" : "";
          const title = index === 0 ? tc.title : "";
          const expectedResult = (index === steps.length - 1) ? tc.expectedResult : "";
          csvContent += `${escapeCsvValue(workItemType)},${escapeCsvValue(title)},${escapeCsvValue(step)},${escapeCsvValue(expectedResult)}\n`;
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `test_cases_for_story_${userStory?.id || 'NA'}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "CSV Downloaded", description: "Test cases have been exported." });
    } else {
      toast({ variant: "destructive", title: "Download Failed", description: "Your browser does not support this feature." });
    }
  };

  const handleUploadTestCases = async () => {
    if (!credentials || !credentials.organizationUrl || !credentials.projectName || !credentials.pat) {
      toast({
        variant: "destructive",
        title: "Authentication Incomplete",
        description: "Your Azure DevOps credentials appear to be missing or incomplete. Please re-authenticate.",
      });
      setIsAuthModalOpen(true);
      return;
    }
    if (!userStory) {
        toast({ variant: "destructive", title: "User Story Missing", description: "Please fetch a user story before uploading test cases."});
        return;
    }
    if (!testPlanId.trim() || !testSuiteId.trim()) {
      toast({ variant: "destructive", title: "Configuration Missing", description: "Please provide Test Plan ID and Test Suite ID."});
      return;
    }
    
    const casesToUpload = testCases.filter(tc => tc.uploadStatus !== 'success');
    if (casesToUpload.length === 0) {
      toast({ title: "No Test Cases to Upload", description: "All test cases have already been successfully uploaded or there are no test cases." });
      return;
    }

    setIsUploadingTests(true);
    setUploadingTestCaseIds(casesToUpload.map(tc => tc.id));

    let successCount = testCases.filter(tc => tc.uploadStatus === 'success').length;
    const totalToUpload = casesToUpload.length;
    let currentUploadIndex = 0;

    for (const testCase of casesToUpload) {
      currentUploadIndex++;
      toast({
        title: "Uploading Test Cases...",
        description: `Uploading ${testCase.id}: ${testCase.title} (${currentUploadIndex}/${totalToUpload})`
      });
      try {
        const createdWorkItem = await uploadTestCaseToAzureDevOps(testCase, testPlanId, testSuiteId, credentials);
        const webUrl = `${credentials.organizationUrl}/${encodeURIComponent(credentials.projectName)}/_workitems/edit/${createdWorkItem.id}`;
        setTestCases(prev => prev.map(tc => 
          tc.id === testCase.id 
          ? { ...tc, uploadStatus: 'success', azureDevOpsId: createdWorkItem.id, azureDevOpsUrl: webUrl, uploadError: undefined } 
          : tc
        ));
        successCount++;
      } catch (error) {
        const uploadErrorMessage = error instanceof Error ? error.message : "Unknown upload error.";
        setTestCases(prev => prev.map(tc => 
          tc.id === testCase.id 
          ? { ...tc, uploadStatus: 'failed', uploadError: uploadErrorMessage } 
          : tc
        ));
        toast({ variant: "destructive", title: `Upload Failed: ${testCase.id}`, description: uploadErrorMessage });
      } finally {
         setUploadingTestCaseIds(prev => prev.filter(id => id !== testCase.id));
      }
    }
    
    setIsUploadingTests(false);
    const totalTestCases = testCases.length;
    if (successCount === totalTestCases) {
       toast({ title: "Upload Complete", description: `✅ ${successCount} test cases created and added to Suite ID ${testSuiteId} in Plan ID ${testPlanId}.` });
    } else if (successCount > 0) {
      toast({ title: "Partial Upload", description: `⚠️ ${successCount} test cases successfully processed. ${totalTestCases - successCount} failed. Check individual cards for errors.` });
    } else {
      toast({ variant: "destructive", title: "Upload Failed", description: `❌ All test case uploads failed. Check individual cards for errors.` });
    }
  };

  const handleAcceptanceCriteriaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (userStory) {
      setUserStory(prevStory => ({
        ...prevStory!,
        acceptanceCriteria: e.target.value,
      }));
    }
  };

  if (credentialsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center">
            <Bot className="mr-3 h-8 w-8" /> Test Genius
          </h1>
          {credentials && (
             <Button variant="ghost" onClick={() => { setCredentials(null); setUserStory(null); setTestCases([]); storyIdForm.reset(); setManualTestCaseCounter(1); setTestPlanId(''); setTestSuiteId('');}} className="text-primary-foreground hover:bg-primary/80">
              <LogIn className="mr-2 h-4 w-4 transform rotate-180" /> Log Out
            </Button>
          )}
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {!credentials ? (
          <Card className="w-full max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-xl">Welcome!</CardTitle>
              <CardDescription>Please authenticate with Azure DevOps to begin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsAuthModalOpen(true)} className="w-full">
                <LogIn className="mr-2 h-4 w-4" /> Authenticate
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Section 1: Fetch User Story */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><FolderSearch className="mr-2 h-6 w-6 text-primary" /> Fetch User Story</CardTitle>
                <CardDescription>Enter the ID of the User Story you want to generate test cases for.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...storyIdForm}>
                  <form onSubmit={storyIdForm.handleSubmit(handleFetchStory)} className="flex flex-col sm:flex-row items-start gap-4">
                    <FormField
                      control={storyIdForm.control}
                      name="storyId"
                      render={({ field }) => (
                        <FormItem className="flex-grow w-full sm:w-auto">
                          <RHFFormLabel htmlFor="storyIdInput" className="sr-only">User Story ID</RHFFormLabel>
                          <FormControl>
                            <Input id="storyIdInput" placeholder="Enter User Story ID (e.g., 12345)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isFetchingStory} className="w-full sm:w-auto">
                      {isFetchingStory ? <LoadingSpinner size={18} className="mr-2" /> : <FolderSearch className="mr-2 h-4 w-4" />}
                      Fetch Story
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Section 2: Display User Story & Generate Button */}
            {userStory && (
              <Card>
                <CardHeader>
                  <CardTitle>User Story Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="storyTitle" className="font-semibold">Business Context (Story Title)</Label>
                    <Input id="storyTitle" readOnly value={userStory.title} className="mt-1 bg-muted/50"/>
                  </div>
                  {userStory.description && userStory.description.trim() !== '' && (
                    <div>
                      <Label htmlFor="storyDescription" className="font-semibold">Story Details (Description)</Label>
                      <Textarea id="storyDescription" readOnly value={userStory.description} rows={4} className="mt-1 bg-muted/50 resize-none"/>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="acceptanceCriteria" className="font-semibold">User Story (Acceptance Criteria)</Label>
                    <Textarea 
                      id="acceptanceCriteria" 
                      value={userStory.acceptanceCriteria} 
                      onChange={handleAcceptanceCriteriaChange}
                      rows={6} 
                      className="mt-1 bg-background resize-y"
                    />
                  </div>
                  <Button onClick={handleGenerateTestCases} disabled={isGeneratingTests || !userStory} className="w-full sm:w-auto">
                    {isGeneratingTests ? <LoadingSpinner size={18} className="mr-2" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate Test Cases
                  </Button>
                   {isGeneratingTests && (
                      <div className="flex items-center justify-center text-muted-foreground mt-2">
                        <Bot className="mr-2 h-5 w-5 animate-bounce" />
                        <span>⏳ Generating test cases with AI... this may take a moment.</span>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}
            
            {/* Section 3: Test Suite Configuration */}
            {userStory && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><ListChecks className="mr-2 h-6 w-6 text-primary" /> Test Suite Configuration</CardTitle>
                  <CardDescription>Enter the Test Plan ID and Test Suite ID where these test cases should be added in Azure DevOps.</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="testPlanIdInput">Test Plan ID</Label>
                    <Input 
                      id="testPlanIdInput" 
                      placeholder="Enter Test Plan ID (e.g., 789)" 
                      value={testPlanId}
                      onChange={(e) => setTestPlanId(e.target.value)} 
                    />
                    {!testPlanId.trim() && isUploadingTests && <p className="text-sm text-destructive mt-1">Test Plan ID is required for upload.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="testSuiteIdInput">Test Suite ID</Label>
                    <Input 
                      id="testSuiteIdInput" 
                      placeholder="Enter Test Suite ID (e.g., 1011)" 
                      value={testSuiteId}
                      onChange={(e) => setTestSuiteId(e.target.value)}
                    />
                    {!testSuiteId.trim() && isUploadingTests && <p className="text-sm text-destructive mt-1">Test Suite ID is required for upload.</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Section 4: Test Cases List & Action Buttons */}
            {userStory && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><ClipboardList className="mr-2 h-6 w-6 text-primary" />Test Cases</CardTitle>
                  <CardDescription>
                    {testCases.length > 0 
                      ? `Currently displaying ${testCases.length} test case(s). Review, edit, or delete them before uploading. You can also add more manually or download as CSV.`
                      : "No test cases yet. Generate them using AI or add one manually."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {testCases.length > 0 ? (
                    <TestCaseList 
                      testCases={testCases} 
                      onUpdateTestCase={handleUpdateTestCase}
                      onDeleteTestCase={handleDeleteTestCase}
                      uploadingTestCases={uploadingTestCaseIds}
                    />
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No test cases to display. Generate some or add one manually.
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 pt-4 flex-wrap">
                    <Button onClick={handleAddManualTestCase} variant="outline" className="w-full sm:w-auto">
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Test Case Manually
                    </Button>
                    <Button 
                      onClick={handleDownloadCsv} 
                      variant="outline" 
                      disabled={testCases.length === 0} 
                      className="w-full sm:w-auto"
                    >
                      <FileDown className="mr-2 h-4 w-4" /> Download CSV
                    </Button>
                    <Button 
                      onClick={handleUploadTestCases} 
                      disabled={isUploadingTests || testCases.length === 0 || testCases.every(tc => tc.uploadStatus === 'success')} 
                      className="w-full sm:w-auto sm:ml-auto"
                    >
                      {isUploadingTests ? <LoadingSpinner size={18} className="mr-2" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      Upload to Azure DevOps
                    </Button>
                  </div>
                  {isUploadingTests && <p className="text-sm text-muted-foreground mt-2 text-center sm:text-left">Uploading... please wait.</p>}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <AuthModal
          isOpen={isAuthModalOpen}
          onOpenChange={setIsAuthModalOpen}
          onAuthenticate={handleAuthentication}
        />

        <AlertDialog open={isGenerateConfirmationOpen} onOpenChange={setIsGenerateConfirmationOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Existing AI Test Cases Found</AlertDialogTitle>
                    <AlertDialogDescription>
                        Do you want to add new AI-generated test cases to the current set (potentially updating existing ones by ID), 
                        or replace all current AI-generated test cases with a fresh set? Manual test cases will always be preserved.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="sm:justify-center">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      className={cn(buttonVariants({ variant: "outline" }))}
                      onClick={() => performAiGeneration('append')}
                    >
                        Generate & Append/Update
                    </AlertDialogAction>
                    <AlertDialogAction onClick={() => performAiGeneration('override')}>
                        Generate & Replace AI Cases
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </main>
      <footer className="text-center py-4 text-sm text-muted-foreground border-t">
        Test Genius - Streamline your testing workflow.
      </footer>
    </div>
  );
}

    