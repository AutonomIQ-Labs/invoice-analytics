import Papa from 'papaparse';
import type { Invoice } from '../types/database';

// Maximum invoice amount threshold - invoices above this are considered data errors
const MAX_INVOICE_AMOUNT = 50_000_000; // $50 million

export interface ParseResult {
  invoices: Omit<Invoice, 'id' | 'imported_at'>[];
  skippedCount: number;
  skippedZeroValue: number;
  skippedPaid: number;
  skippedOutlier: number;
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

function isPaidInvoice(paymentStatus: string): boolean {
  if (!paymentStatus) return false;
  const status = paymentStatus.toLowerCase().trim();
  // Check for various "paid" indicators
  return status === 'paid' || 
         status === 'fully paid' || 
         status.includes('paid in full') ||
         (status.includes('paid') && !status.includes('not paid') && !status.includes('unpaid'));
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

function mapRowToInvoice(row: CsvRow, batchId: string, headers: string[]): { invoice: Omit<Invoice, 'id' | 'imported_at'> | null; skipReason: 'zero' | 'paid' | 'outlier' | null } {
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
    return { invoice: null, skipReason: 'zero' };
  }

  // Skip outlier invoices (likely data entry errors)
  if (amount > MAX_INVOICE_AMOUNT) {
    return { invoice: null, skipReason: 'outlier' };
  }

  // Get payment status (index 12 based on CSV structure)
  const paymentStatus = values[12] || '';
  
  // Skip fully paid invoices
  if (isPaidInvoice(paymentStatus)) {
    return { invoice: null, skipReason: 'paid' };
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
      payment_status: paymentStatus,
      payment_status_indicator: getFieldByIndex(13),
      routing_attribute: getFieldByIndex(14),
      account_coding_status: getFieldByIndex(15),
      days_old: parseInt(getFieldByIndex(16)) || null,
      aging_bucket: getFieldByIndex(17),
      invoice_type: getFieldByIndex(18),
      custom_invoice_status: getFieldByIndex(20),        // Column 20: Custom Invoice Status
      overall_process_state: getFieldByIndex(21),        // Column 21: Overall Process State (e.g., "03 - Header Verified")
      po_type: getFieldByIndex(22),                      // Column 22: PO/Non-PO
      identifying_po: getFieldByIndex(23),               // Column 23: Identifying PO
      import_batch_id: batchId,
    },
    skipReason: null
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
  let skippedPaid = 0;
  let skippedOutlier = 0;
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
      const { invoice, skipReason } = mapRowToInvoice(row, batchId, headers);
      if (invoice) {
        invoices.push(invoice);
      } else {
        skippedCount++;
        if (skipReason === 'zero') skippedZeroValue++;
        if (skipReason === 'paid') skippedPaid++;
        if (skipReason === 'outlier') skippedOutlier++;
      }
    } catch (error) {
      errors.push(`Error parsing row`);
      skippedCount++;
    }
  }

  return { invoices, skippedCount, skippedZeroValue, skippedPaid, skippedOutlier, errors };
}
