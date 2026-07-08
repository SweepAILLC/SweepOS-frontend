import { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  loadingMessage: string | null;
  setLoading: (loading: boolean, message?: string) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  const setLoading = (loading: boolean, message?: string) => {
    setIsLoading(loading);
    setLoadingMessage(message || null);
  };

  return (
    <LoadingContext.Provider value={{ isLoading, loadingMessage, setLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    // Return a no-op function during SSR or if provider isn't available
    // This prevents errors during server-side rendering
    return {
      isLoading: false,
      loadingMessage: null,
      setLoading: () => {}, // No-op function
    };
  }
  return context;
}

