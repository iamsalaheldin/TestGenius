
"use client";

import type { TestCase } from '@/types';
import { TestCaseCard } from './test-case-card';

interface TestCaseListProps {
  testCases: TestCase[];
  onUpdateTestCase: (updatedTestCase: TestCase) => void;
  onDeleteTestCase: (testCaseId: string) => void;
  uploadingTestCases: string[]; // IDs of test cases currently being uploaded
}

export function TestCaseList({ 
  testCases, 
  onUpdateTestCase, 
  onDeleteTestCase,
  uploadingTestCases 
}: TestCaseListProps) {
  if (testCases.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No test cases generated yet. Fetch a user story and click "Generate Test Cases".</p>;
  }

  return (
    <div className="space-y-4">
      {testCases.map(tc => (
        <TestCaseCard
          key={tc.id}
          testCase={tc}
          onUpdate={onUpdateTestCase}
          onDelete={onDeleteTestCase}
          isUploading={uploadingTestCases.includes(tc.id)}
        />
      ))}
    </div>
  );
}
