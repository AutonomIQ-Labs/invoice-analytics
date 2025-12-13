import Papa from 'papaparse';
import type { Invoice } from '../types/database';

// Outlier threshold - invoices above this AND in specific process state are flagged as outliers
const OUTLIER_THRESHOLD = 100_000; // $100,000
const OUTLIER_PROCESS_STATE = '01 - Header To Be Verified';

export interface ParseResult {
  invoices: Omit<Invoice, 'id' | 'imported_at'>[];
  skippedCount: number;
  skippedFullyPaid: number;
  skippedZeroValue: number;
  outlierCount: number;
  outlierHighValue: number;
  outlierNegative: number;
  errors: string[];
}

// Parse ISO 8601 date format (e.g., "2025-11-30T18:00:00.000-06:00" or "2025-11-30")
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const cleaned = dateStr.trim();
  
  // Handle ISO 8601 format with time and timezone (e.g., "2025-11-30T18:00:00.000-06:00")
  if (cleaned.includes('T')) {
    const datePart = cleaned.split('T')[0];
    // Validate it's a proper date format
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }
  }
  
  // Handle simple YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Handle MM-DD-YY or MM-DD-YYYY format (legacy support)
  const parts = cleaned.split('-');
  if (parts.length === 3 && parts[0].length <= 2) {
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

function parseNumber(str: string): number | null {
  if (!str || str.trim() === '') return null;
  const num = parseFloat(str.trim());
  return isNaN(num) ? null : num;
}

// Check if invoice should be skipped (zero-value or fully paid)
function shouldSkipInvoice(amount: number, processState: string): { skip: boolean; reason: 'zero_value' | 'fully_paid' | null } {
  // Skip zero-value invoices
  if (amount === 0) {
    return { skip: true, reason: 'zero_value' };
  }
  
  // Skip fully paid invoices - check process state for "09" prefix or "Fully Paid"
  if (processState) {
    const state = processState.trim();
    if (state.startsWith('09') || state.toLowerCase().includes('fully paid')) {
      return { skip: true, reason: 'fully_paid' };
    }
  }
  
  return { skip: false, reason: null };
}

// Normalize PO type from various formats to "PO" or "Non-PO"
function normalizePoType(rawValue: string): string {
  if (!rawValue) return 'Non-PO';
  const value = rawValue.trim().toLowerCase();
  // CSV uses "Yes" for PO and "No" for Non-PO
  if (value === 'yes' || value === 'po') {
    return 'PO';
  }
  // Everything else is Non-PO
  return 'Non-PO';
}

// Calculate days old from invoice date vs current date
function calculateDaysOld(invoiceDateStr: string | null): number | null {
  if (!invoiceDateStr) return null;
  
  const invoiceDate = new Date(invoiceDateStr);
  if (isNaN(invoiceDate.getTime())) return null;
  
  const today = new Date();
  // Reset time to midnight for accurate day calculation
  today.setHours(0, 0, 0, 0);
  invoiceDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - invoiceDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 ? diffDays : 0;
}

// Detect if file is tab-separated or comma-separated
function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  
  // If there are more tabs than commas in the header, it's likely TSV
  return tabCount > commaCount ? '\t' : ',';
}

interface CsvRow {
  [key: string]: string;
}

interface MapRowResult {
  invoice: Omit<Invoice, 'id' | 'imported_at'> | null;
  skipReason: 'fully_paid' | 'zero_value' | null;
  isOutlier: boolean;
  outlierReason: 'high_value' | 'negative' | null;
}

// Header name to field getter - handles variations in header names
function getField(row: CsvRow, ...possibleHeaders: string[]): string {
  for (const header of possibleHeaders) {
    // Try exact match first
    if (row[header] !== undefined) {
      return (row[header] || '').trim();
    }
    // Try case-insensitive match
    const lowerHeader = header.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lowerHeader) {
        return (row[key] || '').trim();
      }
    }
  }
  return '';
}

function mapRowToInvoice(row: CsvRow, batchId: string): MapRowResult {
  // Get amount using header-based lookup
  const amountStr = getField(row, 'INVOICE_AMOUNT', 'Invoice Amount', 'Amount');
  const amount = parseAmount(amountStr);

  // Get overall process state using header-based lookup
  const overallProcessState = getField(row, 'INVOICE_PROCESS_STATUS', 'Overall Process State', 'Process State');
  
  // Check if invoice should be skipped (zero-value or fully paid)
  const skipCheck = shouldSkipInvoice(amount, overallProcessState);
  if (skipCheck.skip) {
    return { 
      invoice: null, 
      skipReason: skipCheck.reason,
      isOutlier: false, 
      outlierReason: null 
    };
  }

  // Check for outliers - flag them but don't skip
  let isOutlier = false;
  let outlierReason: 'high_value' | 'negative' | null = null;
  
  // High value outlier: amount > $100K AND process state is "01 - Header To Be Verified"
  if (amount > OUTLIER_THRESHOLD && overallProcessState === OUTLIER_PROCESS_STATE) {
    isOutlier = true;
    outlierReason = 'high_value';
  } else if (amount < 0) {
    isOutlier = true;
    outlierReason = 'negative';
  }

  // Parse invoice date first so we can calculate days_old from it
  const invoiceDate = parseDate(getField(row, 'INVOICE_DATE', 'Invoice Date'));
  
  // New CSV column mapping (Output1.csv structure):
  // INVOICE_DATE -> invoice_date
  // INVOICE_ID -> invoice_id
  // CREATION_DATE -> creation_date
  // BUSINESS_UNIT -> business_unit
  // SUPPLIER_NAME -> supplier
  // SUPPLIER_TYPE -> supplier_type
  // INVOICE_NUM -> invoice_number
  // INVOICE_AMOUNT -> invoice_amount
  // PAYMENT_METHOD_CODE -> payment_method
  // PAYMENT_TERMS -> payment_terms
  // INVOICE_TYPE -> invoice_type
  // PO_NONPO -> po_type
  // CODED_BY -> coded_by
  // APPROVER_ID -> approver_id
  // APPROVAL_RESPONSE -> approval_response
  // APPROVAL_DATE -> approval_date
  // INVOICE_PROCESS_STATUS -> overall_process_state
  // PAYMENT_AMOUNT -> payment_amount
  // PAYMENT_DATE -> payment_date
  // PO_NUMBER -> identifying_po
  // ROUTING_ATTRIBUTE1 -> routing_attribute1
  // ROUTING_ATTRIBUTE2 -> routing_attribute2
  // ROUTING_ATTRIBUTE3 -> routing_attribute3
  // ROUTING_ATTRIBUTE4 -> routing_attribute4

  return {
    invoice: {
      invoice_date: invoiceDate,
      invoice_id: getField(row, 'INVOICE_ID', 'Invoice ID', 'Invoices'),
      creation_date: parseDate(getField(row, 'CREATION_DATE', 'Invoice Creation Date', 'Creation Date')),
      business_unit: getField(row, 'BUSINESS_UNIT', 'Business Unit Name', 'Business Unit'),
      supplier: getField(row, 'SUPPLIER_NAME', 'Supplier', 'Vendor'),
      supplier_type: getField(row, 'SUPPLIER_TYPE', 'Vendor Type', 'Supplier Type'),
      invoice_number: getField(row, 'INVOICE_NUM', 'Invoice Number', 'Invoice #'),
      invoice_amount: amount,
      payment_method: getField(row, 'PAYMENT_METHOD_CODE', 'Payment Method'),
      payment_terms: getField(row, 'PAYMENT_TERMS', 'Payment Terms Name', 'Payment Terms'),
      invoice_type: getField(row, 'INVOICE_TYPE', 'Invoice Type Name', 'Invoice Type'),
      // PO_NONPO field uses "Yes" for PO and "No" for Non-PO - normalize to "PO" or "Non-PO"
      po_type: normalizePoType(getField(row, 'PO_NONPO', 'PO/Non-PO', 'PO Type')),
      coded_by: getField(row, 'CODED_BY', 'Coded By') || null,
      approver_id: getField(row, 'APPROVER_ID', 'Approver ID', 'Approver') || null,
      approval_response: getField(row, 'APPROVAL_RESPONSE', 'Response', 'Approval Response') || null,
      approval_date: parseDate(getField(row, 'APPROVAL_DATE', 'Approval Date')),
      overall_process_state: overallProcessState,
      payment_amount: parseNumber(getField(row, 'PAYMENT_AMOUNT', 'Payment Amount')),
      payment_date: parseDate(getField(row, 'PAYMENT_DATE', 'Payment Date')),
      identifying_po: getField(row, 'PO_NUMBER', 'Identifying PO', 'PO Number'),
      // All 4 routing attributes
      routing_attribute1: getField(row, 'ROUTING_ATTRIBUTE1', 'Routing Attribute 1') || null,
      routing_attribute2: getField(row, 'ROUTING_ATTRIBUTE2', 'Routing Attribute 2') || null,
      routing_attribute3: getField(row, 'ROUTING_ATTRIBUTE3', 'Routing Attribute 3') || null,
      routing_attribute4: getField(row, 'ROUTING_ATTRIBUTE4', 'Routing Attribute 4') || null,
      // Calculate days_old dynamically from invoice_date vs current date
      days_old: calculateDaysOld(invoiceDate),
      import_batch_id: batchId,
      // Outlier tracking
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
  let skippedFullyPaid = 0;
  let skippedZeroValue = 0;
  let outlierCount = 0;
  let outlierHighValue = 0;
  let outlierNegative = 0;
  const errors: string[] = [];

  // Auto-detect delimiter (tab or comma)
  const delimiter = detectDelimiter(text);
  
  const results = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: delimiter,
    quoteChar: '"',
    escapeChar: '"',
    transformHeader: (header) => header.trim(),
  });

  if (results.errors.length > 0) {
    errors.push(...results.errors.slice(0, 5).map(e => e.message));
  }

  for (const row of results.data) {
    try {
      const result = mapRowToInvoice(row, batchId);
      if (result.invoice) {
        invoices.push(result.invoice);
        if (result.isOutlier) {
          outlierCount++;
          if (result.outlierReason === 'high_value') outlierHighValue++;
          if (result.outlierReason === 'negative') outlierNegative++;
        }
      } else {
        skippedCount++;
        if (result.skipReason === 'fully_paid') skippedFullyPaid++;
        if (result.skipReason === 'zero_value') skippedZeroValue++;
      }
    } catch (error) {
      errors.push(`Error parsing row`);
      skippedCount++;
    }
  }

  return { 
    invoices, 
    skippedCount, 
    skippedFullyPaid,
    skippedZeroValue,
    outlierCount,
    outlierHighValue,
    outlierNegative,
    errors 
  };
}
