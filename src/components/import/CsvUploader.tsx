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
    skippedFullyPaid: number;
    outlierCount: number;
    outlierHighValue: number;
    outlierNegative: number;
    errors: string[];
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
      
      // Mark all current batches as not current (only one current batch at a time)
      await supabase
        .from('import_batches')
        .update({ is_current: false })
        .eq('is_current', true)
        .or('is_deleted.is.null,is_deleted.eq.false');

      setProgress({ status: 'parsing', message: 'Creating import batch...', progress: 10 });
      
      // Create new batch as current
      const { data: batchData, error: batchError } = await supabase
        .from('import_batches')
        .insert({ 
          filename: file.name, 
          record_count: 0, 
          skipped_count: 0, 
          imported_by: user?.id, 
          is_current: true
        })
        .select()
        .single();

      if (batchError) throw batchError;
      const batch = batchData as ImportBatch;

      setProgress({ status: 'parsing', message: 'Parsing CSV file...', progress: 20 });
      const { 
        invoices, 
        skippedCount, 
        skippedFullyPaid,
        outlierCount,
        outlierHighValue,
        outlierNegative,
        errors 
      } = await parseCsvFile(file, batch.id);

      if (invoices.length === 0) {
        throw new Error('No valid invoices found in the CSV file.');
      }

      setProgress({ status: 'uploading', message: `Uploading ${invoices.length.toLocaleString()} invoices...`, progress: 40 });
      
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
      await supabase.from('import_batches').update({ 
        record_count: invoices.length, 
        skipped_count: skippedCount,
        skipped_fully_paid: skippedFullyPaid,
        outlier_count: outlierCount,
        outlier_high_value: outlierHighValue,
        outlier_negative: outlierNegative
      }).eq('id', batch.id);

      setProgress({ 
        status: 'complete', 
        message: 'Import complete!', 
        progress: 100, 
        result: { 
          imported: invoices.length, 
          skipped: skippedCount, 
          skippedFullyPaid,
          outlierCount,
          outlierHighValue,
          outlierNegative,
          errors 
        } 
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

  const reset = () => {
    setProgress({ status: 'idle', message: '' });
  };

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
          <p className="text-slate-500 text-xs mt-4">Supports CSV format with columns like INVOICE_DATE, SUPPLIER_NAME, etc.</p>
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
          <p className="text-center text-white text-lg mb-6">Import Complete!</p>
          
          {/* Main Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-emerald-400">{progress.result.imported.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Imported</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-slate-400">{progress.result.skipped.toLocaleString()}</p>
              <p className="text-xs text-slate-400">Skipped</p>
            </div>
          </div>

          {/* Outlier Stats */}
          {progress.result.outlierCount > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-orange-400 font-medium">Outliers Detected</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-orange-400">{progress.result.outlierCount.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Total Outliers</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-red-400">{progress.result.outlierHighValue.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">High Value</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-purple-400">{progress.result.outlierNegative.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">Negative</p>
                </div>
              </div>
              <p className="text-xs text-orange-400/70 mt-3 text-center">
                Outliers are imported but excluded from analysis by default. Manage them in the Outliers page.
              </p>
            </div>
          )}

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
