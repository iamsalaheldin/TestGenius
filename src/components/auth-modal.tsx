
"use client";

import type { AzureDevOpsCredentials } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Building, FolderGit2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const authSchema = z.object({
  organizationUrl: z.string().url({ message: "Please enter a valid URL (e.g., https://dev.azure.com/my-org)." }),
  projectName: z.string().min(1, { message: "Project name is required." }),
  pat: z.string().min(1, { message: "Personal Access Token (PAT) is required." }),
});

type AuthFormData = z.infer<typeof authSchema>;

interface AuthModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAuthenticate: (credentials: AzureDevOpsCredentials) => void;
}

export function AuthModal({ isOpen, onOpenChange, onAuthenticate }: AuthModalProps) {
  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      organizationUrl: '',
      projectName: '',
      pat: '',
    },
  });

  function onSubmit(values: AuthFormData) {
    onAuthenticate(values);
    onOpenChange(false); // Close modal on successful submission
    form.reset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-card">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Azure DevOps Authentication</DialogTitle>
          <DialogDescription>
            Please provide your Azure DevOps details and a Personal Access Token (PAT)
            with "Work Items (read & write)" and "Test Management (read & write)" scopes.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="organizationUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Organization URL</FormLabel>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input placeholder="https://dev.azure.com/your-org" {...field} className="pl-10" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Project Name</FormLabel>
                    <div className="relative">
                    <FolderGit2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input placeholder="YourProjectName" {...field} className="pl-10" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Personal Access Token (PAT)</FormLabel>
                   <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <FormControl>
                      <Input type="password" placeholder="Enter your PAT" {...field} className="pl-10" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" className="w-full">
                Authenticate
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
