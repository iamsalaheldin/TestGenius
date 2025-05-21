
"use client";

import type { TestCase } from '@/types';
import { GripVertical, Save, Trash2, Edit3, XCircle } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';

interface TestCaseCardProps {
  testCase: TestCase;
  onUpdate: (updatedTestCase: TestCase) => void;
  onDelete: (testCaseId: string) => void;
  isUploading?: boolean;
}

export function TestCaseCard({ testCase, onUpdate, onDelete, isUploading }: TestCaseCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableTestCase, setEditableTestCase] = useState<TestCase>(testCase);

  useEffect(() => {
    setEditableTestCase(testCase); // Sync with prop changes, e.g. after upload status update
  }, [testCase]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditableTestCase(prev => ({ ...prev, [name]: value }));
  };

  const handlePriorityChange = (value: 'High' | 'Medium' | 'Low') => {
    setEditableTestCase(prev => ({ ...prev, priority: value }));
  };

  const handleSave = () => {
    onUpdate(editableTestCase);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditableTestCase(testCase); // Reset changes
    setIsEditing(false);
  };

  const getPriorityBadgeVariant = (priority: 'High' | 'Medium' | 'Low') => {
    switch (priority) {
      case 'High': return 'destructive';
      case 'Medium': return 'secondary'; // Use secondary for Medium, or customize if needed
      case 'Low': return 'outline';
      default: return 'default';
    }
  };

  return (
    <Card className={cn("w-full shadow-md hover:shadow-lg transition-shadow", {
      "border-green-500": testCase.uploadStatus === 'success',
      "border-red-500": testCase.uploadStatus === 'failed',
      "opacity-70 cursor-not-allowed": isUploading
    })}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        {isEditing ? (
          <Input
            name="title"
            value={editableTestCase.title}
            onChange={handleInputChange}
            className="text-lg font-semibold"
            disabled={isUploading}
          />
        ) : (
          <CardTitle className="text-lg font-semibold">{testCase.id}: {testCase.title}</CardTitle>
        )}
        <div className="flex items-center space-x-2">
          {!isEditing && (
             <Badge variant={getPriorityBadgeVariant(testCase.priority)}>{testCase.priority}</Badge>
          )}
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" onClick={handleSave} disabled={isUploading} title="Save">
                <Save className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleCancel} disabled={isUploading} title="Cancel">
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} disabled={isUploading || testCase.uploadStatus === 'success'} title="Edit">
              <Edit3 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onDelete(testCase.id)} disabled={isUploading || testCase.uploadStatus === 'success'} title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <>
            <div>
              <Label htmlFor={`priority-${testCase.id}`} className="text-sm font-medium">Priority</Label>
              <Select
                name="priority"
                value={editableTestCase.priority}
                onValueChange={handlePriorityChange}
                disabled={isUploading}
              >
                <SelectTrigger id={`priority-${testCase.id}`}>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`description-${testCase.id}`} className="text-sm font-medium">Description (Steps)</Label>
              <Textarea
                id={`description-${testCase.id}`}
                name="description"
                value={editableTestCase.description}
                onChange={handleInputChange}
                rows={4}
                className="resize-none"
                disabled={isUploading}
              />
            </div>
            <div>
              <Label htmlFor={`expectedResult-${testCase.id}`} className="text-sm font-medium">Expected Result</Label>
              <Textarea
                id={`expectedResult-${testCase.id}`}
                name="expectedResult"
                value={editableTestCase.expectedResult}
                onChange={handleInputChange}
                rows={3}
                className="resize-none"
                disabled={isUploading}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description (Steps)</p>
              <p className="text-sm whitespace-pre-wrap">{testCase.description}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Expected Result</p>
              <p className="text-sm whitespace-pre-wrap">{testCase.expectedResult}</p>
            </div>
          </>
        )}
      </CardContent>
      {(testCase.uploadStatus === 'failed' && testCase.uploadError) && (
        <CardFooter className="text-xs text-destructive pt-2">
          <p>Upload failed: {testCase.uploadError}</p>
        </CardFooter>
      )}
      {testCase.uploadStatus === 'success' && testCase.azureDevOpsUrl && (
         <CardFooter className="text-xs text-green-600 pt-2">
          <a href={testCase.azureDevOpsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
            View on Azure DevOps (ID: {testCase.azureDevOpsId})
          </a>
        </CardFooter>
      )}
    </Card>
  );
}
