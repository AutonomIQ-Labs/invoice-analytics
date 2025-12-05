import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { parseCsvFile } from '../../lib/csv-parser';
import { useAuth } from '../../hooks/useAuth';
import type { ImportBatch } from '../../types/database';

interface CsvUploaderProps {
  onImportComplete?: () => void;
}

interface ImportProgress {
  status: 'idle' | 'parsing' | 'uploading' | 'complete' | 'error';
  message: string;
  progress?: number;
  result?: { 
    imported: number; 
    skipped: number; 
    skippedZeroValue: number;
    skippedPaid: number;
    errors: string[] 
  };
}

export function CsvUploader({ onImportComplete }: CsvUploaderProps) {
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ status: 'idle', message: '' });

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setProgress({ status: 'error', message: 'Please upload a CSV or TXT file' });
      return;
    }

    try {
      setProgress({ status: 'parsing', message: 'Preparing import...', progress: 5 });
      
      // Mark all existing non-deleted batches as not current
      await supabase
        .from('import_batches')
        .update({ is_current: false })
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false');

      setProgress({ status: 'parsing', message: 'Creating import batch...', progress: 10 });
      
      // Create new batch as current
      const { data: batchData, error: batchError } = await supabase
        .from('import_batches')
        .insert({ filename: file.name, record_count: 0, skipped_count: 0, imported_by: user?.id, is_current: true })
        .select()
        .single();

      if (batchError) throw batchError;
      const batch = batchData as ImportBatch;

      setProgress({ status: 'parsing', message: 'Parsing CSV file...', progress: 20 });
      const { invoices, skippedCount, skippedZeroValue, skippedPaid, errors } = await parseCsvFile(file, batch.id);

      if (invoices.length === 0) {
        throw new Error('No valid invoices found. Zero-value and fully paid invoices are filtered out.');
      }

      setProgress({ status: 'uploading', message: `Uploading ${invoices.length} invoices...`, progress: 40 });
      
      const BATCH_SIZE = 500;
      let uploaded = 0;

      for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
        const batchInvoices = invoices.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase.from('invoices').insert(batchInvoices as any[]);
        if (insertError) throw insertError;

        uploaded += batchInvoices.length;
        setProgress({ status: 'uploading', message: `Uploaded ${uploaded.toLocaleString()} of ${invoices.length.toLocaleString()} invoices...`, progress: 40 + (uploaded / invoices.length) * 50 });
      }

      setProgress({ status: 'uploading', message: 'Finalizing import...', progress: 95 });
      await supabase.from('import_batches').update({ record_count: invoices.length, skipped_count: skippedCount }).eq('id', batch.id);

      setProgress({ 
        status: 'complete', 
        message: 'Import complete!', 
        progress: 100, 
        result: { imported: invoices.length, skipped: skippedCount, skippedZeroValue, skippedPaid, errors } 
      });
      onImportComplete?.();
    } catch (error) {
      setProgress({ status: 'error', message: error instanceof Error ? error.message : 'Import failed' });
    }
  }, [user, onImportComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = () => setProgress({ status: 'idle', message: '' });

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Import CSV Data</h3>

      {progress.status === 'idle' && (
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? 'border-sky-500 bg-sky-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
          <svg className="w-12 h-12 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-slate-300 mb-2">Drag and drop your CSV file here</p>
          <p className="text-slate-500 text-sm mb-4">or</p>
          <label className="btn-primary cursor-pointer">
            Browse Files
            <input type="file" accept=".csv,.txt" onChange={handleFileInput} className="hidden" />
          </label>
          <p className="text-slate-500 text-xs mt-4">Zero-value and fully paid invoices will be automatically filtered out</p>
        </div>
      )}

      {(progress.status === 'parsing' || progress.status === 'uploading') && (
        <div className="py-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-center text-white mb-2">{progress.message}</p>
          {progress.progress !== undefined && (
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-300" style={{ width: `${progress.progress}%` }}></div>
            </div>
          )}
        </div>
      )}

      {progress.status === 'complete' && progress.result && (
        <div className="py-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <p className="text-center text-white text-lg mb-4">Import Complete!</p>
          
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{progress.result.imported.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Imported</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{progress.result.skippedZeroValue.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Zero Value</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-400">{progress.result.skippedPaid.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Fully Paid</p>
            </div>
          </div>

          <div className="text-center text-sm text-slate-400 mb-4">
            Total skipped: {progress.result.skipped.toLocaleString()} invoices
          </div>

          {progress.result.errors.length > 0 && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 text-sm font-medium mb-1">Warnings:</p>
              <ul className="text-amber-400/80 text-xs space-y-1">
                {progress.result.errors.slice(0, 5).map((err, i) => (<li key={i}>{err}</li>))}
                {progress.result.errors.length > 5 && (<li>...and {progress.result.errors.length - 5} more</li>)}
              </ul>
            </div>
          )}

          <button onClick={reset} className="btn-primary w-full">Import Another File</button>
        </div>
      )}

      {progress.status === 'error' && (
        <div className="py-6">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <p className="text-center text-white text-lg mb-2">Import Failed</p>
          <p className="text-center text-red-400 mb-6">{progress.message}</p>
          <button onClick={reset} className="btn-secondary w-full">Try Again</button>
        </div>
      )}
    </div>
  );
}
