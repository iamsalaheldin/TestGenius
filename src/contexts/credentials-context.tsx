
"use client";

import type { AzureDevOpsCredentials } from '@/types';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface CredentialsContextType {
  credentials: AzureDevOpsCredentials | null;
  setCredentials: Dispatch<SetStateAction<AzureDevOpsCredentials | null>>;
  isLoading: boolean;
}

const CredentialsContext = createContext<CredentialsContextType | undefined>(undefined);

const CREDENTIALS_STORAGE_KEY = 'azureDevOpsPatCredentials';

export function CredentialsProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<AzureDevOpsCredentials | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedCredentials = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
      if (storedCredentials) {
        setCredentials(JSON.parse(storedCredentials));
      }
    } catch (error) {
      console.error("Failed to load credentials from localStorage:", error);
      localStorage.removeItem(CREDENTIALS_STORAGE_KEY); // Clear corrupted data
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) { // Only save when not initially loading
      try {
        if (credentials) {
          localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
        } else {
          localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
        }
      } catch (error) {
        console.error("Failed to save credentials to localStorage:", error);
      }
    }
  }, [credentials, isLoading]);

  return (
    <CredentialsContext.Provider value={{ credentials, setCredentials, isLoading }}>
      {children}
    </CredentialsContext.Provider>
  );
}

export function useCredentials() {
  const context = useContext(CredentialsContext);
  if (context === undefined) {
    throw new Error('useCredentials must be used within a CredentialsProvider');
  }
  return context;
}
