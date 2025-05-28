
"use client";

import { generateTestCases, type GenerateTestCasesInput } from '@/ai/flows/generate-test-cases';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCredentials } from '@/contexts/credentials-context';
import { useToast } from '@/hooks/use-toast';
import { fetchUserStoryById, uploadTestCaseToAzureDevOps } from '@/lib/azure-devops-api';
import type { AzureDevOpsCredentials, TestCase, UserStory } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bot, FolderSearch, LogIn, UploadCloud, Sparkles, PlusCircle, FileDown, ListChecks, ClipboardList, Paperclip, X, Loader2, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { summarizeTestCaseGenerationResults } from '@/ai/flows/summarize-test-case-generation-results';

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';


const storyIdSchema = z.object({
  storyId: z.string().min(1, { message: "User Story ID is required." }).regex(/^\d+$/, { message: "Story ID must be a number." }),
});
type StoryIdFormData = z.infer<typeof storyIdSchema>;

interface ProcessedDocument {
  id: string;
  name: string;
  text: string | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
}

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

  const [processedDocuments, setProcessedDocuments] = useState<ProcessedDocument[]>([]);
  const [isProcessingDocs, setIsProcessingDocs] = useState(false);


  const storyIdForm = useForm<StoryIdFormData>({
    resolver: zodResolver(storyIdSchema),
    defaultValues: { storyId: '' },
  });

  useEffect(() => {
    if (!credentialsLoading && !credentials) {
      setIsAuthModalOpen(true);
    }
  }, [credentials, credentialsLoading]);

  useEffect(() => {
    try {
       pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    } catch (e) {
      console.warn("Could not set pdf.js workerSrc from package, falling back to /public/pdf.worker.min.js. Ensure the file exists there or use a CDN.", e);
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
    }
  }, []);


  const handleAuthentication = async (creds: AzureDevOpsCredentials) => {
    setCredentials(creds);
    toast({ title: "Authenticated", description: "Azure DevOps credentials saved." });
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
    setProcessedDocuments([]); 
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

    const businessDocumentsText = processedDocuments
        .filter(doc => doc.status === 'success' && doc.text)
        .map(doc => `--- Document: ${doc.name} ---\n${doc.text}\n--- End Document: ${doc.name} ---`)
        .join('\n\n');

    try {
      const aiInput: GenerateTestCasesInput = {
        storyTitle: userStory.title,
        acceptanceCriteria: userStory.acceptanceCriteria,
        dataDictionary: "", // Placeholder for now, UI to be added
        businessDocumentsText: businessDocumentsText || undefined,
      };

      const generated = await generateTestCases(aiInput);

      if (mode === 'append') {
        setTestCases(prev => {
          const manualCases = prev.filter(tc => tc.id.startsWith("MANUAL-"));
          const existingAiCases = prev.filter(tc => !tc.id.startsWith("MANUAL-"));
          
          const aiCasesMap = new Map(existingAiCases.map(tc => [tc.id, tc]));
          generated.forEach(newTc => aiCasesMap.set(newTc.id, {...newTc, uploadStatus: 'pending'} as TestCase));
          const finalUniqueAiCases = Array.from(aiCasesMap.values());

          return [...manualCases, ...finalUniqueAiCases];
        });
      } else { // Override mode
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
      description: '', // Prerequisites are now part of description
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
    const errorMessages: string[] = [];


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
        errorMessages.push(`${testCase.id}: ${uploadErrorMessage}`);
        setTestCases(prev => prev.map(tc => 
          tc.id === testCase.id 
          ? { ...tc, uploadStatus: 'failed', uploadError: uploadErrorMessage } 
          : tc
        ));
      } finally {
         setUploadingTestCaseIds(prev => prev.filter(id => id !== testCase.id));
      }
    }
    
    setIsUploadingTests(false);
    const failureCount = totalToUpload - (successCount - testCases.filter(tc => tc.uploadStatus === 'success' && !casesToUpload.find(c => c.id === tc.id)).length); 

    if (failureCount > 0 && successCount > 0) {
      toast({ title: "Partial Upload Complete", description: `Successfully uploaded ${successCount - testCases.filter(tc => tc.uploadStatus === 'success' && !casesToUpload.find(c => c.id === tc.id)).length} test cases. ${failureCount} failed. Check cards for details.` });
    } else if (successCount > 0 && failureCount === 0) {
      toast({ title: "Upload Complete", description: `All ${successCount - testCases.filter(tc => tc.uploadStatus === 'success' && !casesToUpload.find(c => c.id === tc.id)).length} test cases successfully uploaded to Suite ID ${testSuiteId}.` });
    } else if (failureCount > 0 && successCount === 0) {
      toast({ variant: "destructive", title: "Upload Failed", description: `All ${failureCount} test case uploads failed. Check cards for details.` });
    }
    
    if (casesToUpload.length > 0) {
      try {
        const summaryResult = await summarizeTestCaseGenerationResults({
            successCount: successCount - testCases.filter(tc => tc.uploadStatus === 'success' && !casesToUpload.find(c => c.id === tc.id)).length,
            failureCount: failureCount,
            errorMessages: errorMessages,
        });
        toast({
            title: "Upload Summary",
            description: `${summaryResult.summary} ${summaryResult.progress}`,
            duration: 7000,
        });
      } catch (summaryError) {
          console.error("Failed to get upload summary from AI:", summaryError);
      }
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      if (processedDocuments.length === 0) {
        setProcessedDocuments([]);
      }
      return;
    }
  
    setIsProcessingDocs(true);
    const newFileEntries = Array.from(files).map(file => ({
        id: `${file.name}-${file.lastModified}`,
        name: file.name,
        text: null,
        status: 'processing' as ProcessedDocument['status'],
        errorMessage: undefined
    }));

    setProcessedDocuments(prevDocs => {
      const updatedDocs = [...prevDocs];
      newFileEntries.forEach(newDocEntry => {
        const existingIndex = updatedDocs.findIndex(d => d.id === newDocEntry.id);
        if (existingIndex > -1) {
          updatedDocs[existingIndex] = { ...updatedDocs[existingIndex], status: 'processing', text: null, errorMessage: undefined };
        } else {
          updatedDocs.push(newDocEntry);
        }
      });
      return updatedDocs;
    });
  
    for (const file of Array.from(files)) {
      const docId = `${file.name}-${file.lastModified}`;
      try {
        const arrayBuffer = await file.arrayBuffer();
        let extractedText = '';
  
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.toLowerCase().endsWith('.docx')) {
          const result = await mammoth.extractRawText({ arrayBuffer });
          extractedText = result.value;
        } else if (file.type === 'application/msword' || file.name.toLowerCase().endsWith('.doc')) {
          try {
            const result = await mammoth.extractRawText({ arrayBuffer });
            extractedText = result.value;
          } catch (docError) {
            console.warn(`Limited support for .doc file ${file.name}:`, docError);
            setProcessedDocuments(prev => prev.map(d =>
              d.id === docId ? { ...d, status: 'error', text: null, errorMessage: `Failed to parse .doc file: ${file.name}. Limited support.` } : d
            ));
            continue;
          }
        } else if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
          extractedText = await file.text();
        } else {
          setProcessedDocuments(prev => prev.map(d =>
            d.id === docId ? { ...d, status: 'error', text: null, errorMessage: `Unsupported file type: ${file.type || 'unknown'}` } : d
          ));
          continue; 
        }
        setProcessedDocuments(prev => prev.map(d =>
          d.id === docId ? { ...d, text: extractedText.trim(), status: 'success' } : d
        ));
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        setProcessedDocuments(prev => prev.map(d =>
          d.id === docId ? { ...d, status: 'error', text: null, errorMessage: (error instanceof Error ? error.message : 'Unknown error') } : d
        ));
      }
    }
    setIsProcessingDocs(false);
    if (event.target) {
      event.target.value = ''; 
    }
  };

  const handleRemoveDocument = (docId: string) => {
    setProcessedDocuments(prev => prev.filter(doc => doc.id !== docId));
  };

  const handleClearAllDocuments = () => {
    setProcessedDocuments([]);
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
          <div className="flex items-center space-x-4">
            {credentials && (
              <Button variant="ghost" onClick={() => { setCredentials(null); setUserStory(null); setTestCases([]); storyIdForm.reset(); setManualTestCaseCounter(1); setTestPlanId(''); setTestSuiteId(''); setProcessedDocuments([]);}} className="text-primary-foreground hover:bg-primary/80">
                <LogIn className="mr-2 h-4 w-4 transform rotate-180" /> Log Out
              </Button>
            )}
          </div>
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
                  <form onSubmit={storyIdForm.handleSubmit(handleFetchStory)} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
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
                </CardContent>
              </Card>
            )}

            {/* Section: Supporting Documents Upload */}
            {userStory && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><Paperclip className="mr-2 h-6 w-6 text-primary" /> Supporting Documents</CardTitle>
                  <CardDescription>Upload PDF, DOCX, DOC, or TXT files to provide additional context for test case generation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input 
                    type="file" 
                    multiple 
                    accept=".pdf,.doc,.docx,.txt" 
                    onChange={handleFileChange}
                    disabled={isProcessingDocs}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:inline-flex file:items-center file:justify-center"
                  />
                  {processedDocuments.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-md font-semibold">Selected Files:</h4>
                        <Button variant="outline" size="sm" onClick={handleClearAllDocuments} disabled={isProcessingDocs}>
                          <Trash2 className="mr-2 h-4 w-4" /> Clear All
                        </Button>
                      </div>
                      <ul className="space-y-2">
                        {processedDocuments.map(doc => (
                          <li key={doc.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/30">
                            <div className="flex items-center space-x-2 overflow-hidden">
                              {doc.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                              {doc.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                              {doc.status === 'error' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                              <span className="text-sm truncate" title={doc.name}>{doc.name}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveDocument(doc.id)} disabled={isProcessingDocs} className="h-7 w-7">
                              <X className="h-4 w-4" />
                              <span className="sr-only">Remove {doc.name}</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                       {processedDocuments.some(doc => doc.status === 'error') && (
                        <Alert variant="destructive" className="mt-2">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>File Processing Error</AlertTitle>
                            <AlertDescription>
                            Some documents could not be processed. Check individual errors or try again.
                            {processedDocuments.filter(d=>d.status === 'error').map(d => <p key={d.id} className="text-xs">- {d.name}: {d.errorMessage}</p>)}
                            </AlertDescription>
                        </Alert>
                        )}
                    </div>
                  )}
                  {isProcessingDocs && (
                    <div className="flex items-center justify-center text-muted-foreground mt-2">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        <span>Processing documents...</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Button to Generate Test Cases */}
            {userStory && (
              <div className="mt-6">
                 <Button onClick={handleGenerateTestCases} disabled={isGeneratingTests || !userStory || isProcessingDocs} className="w-full sm:w-auto">
                    {isGeneratingTests ? <LoadingSpinner size={18} className="mr-2" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate Test Cases
                  </Button>
                   {isGeneratingTests && (
                      <div className="flex items-center justify-center text-muted-foreground mt-2">
                        <Bot className="mr-2 h-5 w-5 animate-bounce" />
                        <span>⏳ Generating test cases with AI... this may take a moment.</span>
                      </div>
                    )}
              </div>
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
                <AlertDialogFooter className="sm:justify-center sm:flex-wrap">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      className={cn(buttonVariants({ variant: "outline" }), "text-foreground")}
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

    