import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SheetData {
  [key: string]: string | number;
}

interface UseGoogleSheetsReturn {
  data: SheetData[];
  columns: string[];
  isLoading: boolean;
  error: string | null;
  fetchSheet: (sheetUrl: string, sheetName?: string) => Promise<void>;
}

export function useGoogleSheets(): UseGoogleSheetsReturn {
  const [data, setData] = useState<SheetData[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSheet = useCallback(async (sheetUrl: string, sheetName?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: response, error: funcError } = await supabase.functions.invoke('fetch-sheets', {
        body: { sheetUrl, sheetName }
      });

      if (funcError) {
        throw new Error(funcError.message || 'Erro ao buscar dados');
      }

      if (response?.error) {
        throw new Error(response.error);
      }

      setData(response.data || []);
      setColumns(response.columns || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('Error fetching Google Sheets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, columns, isLoading, error, fetchSheet };
}
