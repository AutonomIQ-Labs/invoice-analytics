import Papa from 'papaparse';
import type { Invoice } from '../types/database';

// Outlier threshold - invoices above this are flagged as outliers
const OUTLIER_THRESHOLD = 50_000; // $50,000

export interface ParseResult {
  invoices: Omit<Invoice, 'id' | 'imported_at'>[];
  skippedCount: number;
  skippedZeroValue: number;
  skippedFullyPaid: number;
  outlierCount: number;
  outlierHighValue: number;
  outlierNegative: number;
  errors: string[];
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const cleaned = dateStr.trim();
  const parts = cleaned.split('-');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseAmount(amountStr: string): number {
  if (!amountStr || amountStr.trim() === '') return 0;
  
  // Check for accounting-format negative numbers like ($1.00) or (1.00)
  const isNegative = amountStr.includes('(') && amountStr.includes(')');
  
  // Remove $, commas, quotes, spaces, and parentheses
  const cleaned = amountStr.replace(/[$,"\s()]/g, '');
  const amount = parseFloat(cleaned);
  
  if (isNaN(amount)) return 0;
  return isNegative ? -amount : amount;
}

function isFullyPaidState(processState: string): boolean {
  if (!processState) return false;
  const state = processState.trim();
  // Check for "09 - Fully Paid" process state
  return state.startsWith('09') || state.toLowerCase().includes('fully paid');
}

function preprocessFile(text: string): string {
  const lines = text.split('\n');
  const processedLines: string[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    let processed = line
      .replace(/"\t/g, ',')
      .replace(/\t"/g, ',')
      .replace(/\t/g, ',')
      .replace(/^"/, '')
      .replace(/"$/, '')
      .replace(/""/g, '"');
    
    processedLines.push(processed);
  }
  
  return processedLines.join('\n');
}

interface CsvRow {
  [key: string]: string;
}

interface MapRowResult {
  invoice: Omit<Invoice, 'id' | 'imported_at'> | null;
  skipReason: 'zero' | 'fully_paid' | null;
  isOutlier: boolean;
  outlierReason: 'high_value' | 'negative' | null;
}

function mapRowToInvoice(row: CsvRow, batchId: string, headers: string[]): MapRowResult {
  const values = headers.map(h => row[h] || '');
  
  // Find amount
  let amountStr = '';
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    if (header.includes('amount')) {
      amountStr = values[i];
      break;
    }
  }
  if (!amountStr) {
    for (let i = 0; i < values.length; i++) {
      if (values[i] && values[i].includes('$')) {
        amountStr = values[i];
        break;
      }
    }
  }
  
  const amount = parseAmount(amountStr);
  
  // Skip zero-value invoices
  if (amount === 0) {
    return { invoice: null, skipReason: 'zero', isOutlier: false, outlierReason: null };
  }

  // Get overall process state (index 21 based on CSV structure)
  const overallProcessState = values[21] || '';
  
  // Skip fully paid invoices based on Overall Process State (not payment status)
  if (isFullyPaidState(overallProcessState)) {
    return { invoice: null, skipReason: 'fully_paid', isOutlier: false, outlierReason: null };
  }

  // Check for outliers - flag them but don't skip
  let isOutlier = false;
  let outlierReason: 'high_value' | 'negative' | null = null;
  
  if (amount > OUTLIER_THRESHOLD) {
    isOutlier = true;
    outlierReason = 'high_value';
  } else if (amount < 0) {
    isOutlier = true;
    outlierReason = 'negative';
  }

  const getFieldByIndex = (index: number): string => values[index] || '';

  // CSV columns (0-indexed):
  // 0: Invoice Date, 1: Invoices, 2: Invoice Creation Date, 3: Business Unit Name
  // 4: Approval Status, 5: Supplier, 6: Supplier Type, 7: Invoice Number
  // 8: Invoice Amount, 9: Validation Status, 10: Payment Method, 11: Payment Terms Name
  // 12: Payment Status Name, 13: Payment Status Indicator, 14: Routing Attribute 3
  // 15: Account Coding Status, 16: Days Old, 17: Aging, 18: Invoice Type Name
  // 19: Days from Initial Entry to Payment, 20: Custom Invoice Status
  // 21: Overall Process State, 22: PO/Non-PO, 23: Identifying PO
  return {
    invoice: {
      invoice_date: parseDate(getFieldByIndex(0)),
      invoice_id: getFieldByIndex(1),
      creation_date: parseDate(getFieldByIndex(2)),
      business_unit: getFieldByIndex(3),
      approval_status: getFieldByIndex(4),
      supplier: getFieldByIndex(5),
      supplier_type: getFieldByIndex(6),
      invoice_number: getFieldByIndex(7),
      invoice_amount: amount,
      validation_status: getFieldByIndex(9),
      payment_method: getFieldByIndex(10),
      payment_terms: getFieldByIndex(11),
      payment_status: getFieldByIndex(12),
      payment_status_indicator: getFieldByIndex(13),
      routing_attribute: getFieldByIndex(14),
      account_coding_status: getFieldByIndex(15),
      days_old: parseInt(getFieldByIndex(16)) || null,
      aging_bucket: getFieldByIndex(17),
      invoice_type: getFieldByIndex(18),
      custom_invoice_status: getFieldByIndex(20),
      overall_process_state: overallProcessState,
      po_type: getFieldByIndex(22),
      identifying_po: getFieldByIndex(23),
      import_batch_id: batchId,
      is_outlier: isOutlier,
      outlier_reason: outlierReason,
      include_in_analysis: !isOutlier, // Outliers excluded by default
    },
    skipReason: null,
    isOutlier,
    outlierReason
  };
}

export function parseCsvFile(file: File, batchId: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseCsvText(text, batchId);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function parseCsvText(text: string, batchId: string): ParseResult {
  const invoices: Omit<Invoice, 'id' | 'imported_at'>[] = [];
  let skippedCount = 0;
  let skippedZeroValue = 0;
  let skippedFullyPaid = 0;
  let outlierCount = 0;
  let outlierHighValue = 0;
  let outlierNegative = 0;
  const errors: string[] = [];

  const processedText = preprocessFile(text);
  
  const results = Papa.parse<CsvRow>(processedText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (results.errors.length > 0) {
    errors.push(...results.errors.slice(0, 5).map(e => e.message));
  }

  const headers = results.meta.fields || [];

  for (const row of results.data) {
    try {
      const { invoice, skipReason, isOutlier, outlierReason } = mapRowToInvoice(row, batchId, headers);
      if (invoice) {
        invoices.push(invoice);
        if (isOutlier) {
          outlierCount++;
          if (outlierReason === 'high_value') outlierHighValue++;
          if (outlierReason === 'negative') outlierNegative++;
        }
      } else {
        skippedCount++;
        if (skipReason === 'zero') skippedZeroValue++;
        if (skipReason === 'fully_paid') skippedFullyPaid++;
      }
    } catch (error) {
      errors.push(`Error parsing row`);
      skippedCount++;
    }
  }

  return { 
    invoices, 
    skippedCount, 
    skippedZeroValue, 
    skippedFullyPaid,
    outlierCount,
    outlierHighValue,
    outlierNegative,
    errors 
  };
}
