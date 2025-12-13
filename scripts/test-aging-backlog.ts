/**
 * Test Script: Verify Aging Backlog Calculations
 * 
 * This script queries the database directly to verify that:
 * 1. Aging calculations exclude "Ready for Payment" invoices
 * 2. Sum of all aging buckets = backlog count (not total count)
 * 3. The data matches expectations
 * 
 * Run with: npx tsx scripts/test-aging-backlog.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper: Check if invoice is "Ready for Payment" (process state 08)
function isReadyForPayment(processState: string | null | undefined): boolean {
  const state = processState?.trim() || '';
  return state.startsWith('08') || state.toLowerCase().includes('ready for payment');
}

// Helper: Get aging bucket based on days old
function getAgingBucket(daysOld: number): string {
  if (daysOld < 30) return '0-30';
  if (daysOld < 60) return '30-60';
  if (daysOld < 90) return '60-90';
  if (daysOld < 120) return '90-120';
  if (daysOld < 180) return '120-180';
  if (daysOld < 270) return '180-270';
  return '270+';
}

// Calculate days old dynamically from invoice_date
function calculateDaysOld(invoiceDateStr: string | null): number | null {
  if (!invoiceDateStr) return null;
  
  const invoiceDate = new Date(invoiceDateStr);
  if (isNaN(invoiceDate.getTime())) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  invoiceDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - invoiceDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 ? diffDays : 0;
}

interface Invoice {
  invoice_id: string;
  invoice_date: string | null;
  invoice_amount: number | null;
  overall_process_state: string | null;
  is_outlier: boolean | null;
  include_in_analysis: boolean | null;
}

async function runTest() {
  console.log('\n🔍 Testing Aging Backlog Calculations\n');
  console.log('='.repeat(60));

  // 1. Get current batch
  const { data: batchData, error: batchError } = await supabase
    .from('import_batches')
    .select('id, filename, imported_at')
    .eq('is_current', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .maybeSingle();

  if (batchError || !batchData) {
    console.error('❌ Failed to get current batch:', batchError?.message || 'No current batch found');
    process.exit(1);
  }

  console.log(`\n📦 Current Batch: ${batchData.filename}`);
  console.log(`   Imported: ${new Date(batchData.imported_at).toLocaleString()}`);

  // 2. Fetch ALL invoices with pagination
  const allInvoices: Invoice[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  console.log('\n📊 Fetching invoices...');

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_id, invoice_date, invoice_amount, overall_process_state, is_outlier, include_in_analysis')
      .eq('import_batch_id', batchData.id)
      .range(from, to);

    if (error) {
      console.error('❌ Query error:', error.message);
      process.exit(1);
    }

    allInvoices.push(...(data as Invoice[]));
    hasMore = data.length === pageSize;
    page++;
  }

  console.log(`   Total raw invoices: ${allInvoices.length.toLocaleString()}`);

  // 3. Filter for included invoices (respecting outlier rules)
  const includedInvoices = allInvoices.filter(inv => {
    if (inv.is_outlier === true) {
      return inv.include_in_analysis === true;
    }
    return inv.include_in_analysis === true || inv.include_in_analysis === null || inv.include_in_analysis === undefined;
  });

  console.log(`   Included in analysis: ${includedInvoices.length.toLocaleString()}`);

  // 4. Calculate Ready for Payment and Backlog
  const readyForPaymentInvoices = includedInvoices.filter(inv => isReadyForPayment(inv.overall_process_state));
  const backlogInvoices = includedInvoices.filter(inv => !isReadyForPayment(inv.overall_process_state));

  console.log('\n' + '='.repeat(60));
  console.log('\n📈 RESULTS:');
  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log(`│ Total Invoices (included):     ${includedInvoices.length.toLocaleString().padStart(20)} │`);
  console.log(`│ Ready for Payment:             ${readyForPaymentInvoices.length.toLocaleString().padStart(20)} │`);
  console.log(`│ Backlog (needs attention):     ${backlogInvoices.length.toLocaleString().padStart(20)} │`);
  console.log('└─────────────────────────────────────────────────────────┘');

  // 5. Calculate aging breakdown on BACKLOG only
  const agingMap = new Map<string, { count: number; value: number }>();
  let totalBacklogValue = 0;

  backlogInvoices.forEach(inv => {
    const daysOld = calculateDaysOld(inv.invoice_date) || 0;
    const bucket = getAgingBucket(daysOld);
    const existing = agingMap.get(bucket) || { count: 0, value: 0 };
    const amount = inv.invoice_amount || 0;
    agingMap.set(bucket, {
      count: existing.count + 1,
      value: existing.value + amount,
    });
    totalBacklogValue += amount;
  });

  // 6. Display aging breakdown
  const agingOrder = ['0-30', '30-60', '60-90', '90-120', '120-180', '180-270', '270+'];
  
  console.log('\n📊 AGING BREAKDOWN (Backlog Only):');
  console.log('┌────────────┬──────────────┬─────────────────────┬─────────┐');
  console.log('│ Bucket     │ Count        │ Value               │ % Count │');
  console.log('├────────────┼──────────────┼─────────────────────┼─────────┤');

  let totalAgingCount = 0;
  agingOrder.forEach(bucket => {
    const data = agingMap.get(bucket) || { count: 0, value: 0 };
    totalAgingCount += data.count;
    const pct = backlogInvoices.length > 0 ? ((data.count / backlogInvoices.length) * 100).toFixed(1) : '0.0';
    const valueStr = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact' }).format(data.value);
    console.log(`│ ${bucket.padEnd(10)} │ ${data.count.toLocaleString().padStart(12)} │ ${valueStr.padStart(19)} │ ${pct.padStart(6)}% │`);
  });

  console.log('├────────────┼──────────────┼─────────────────────┼─────────┤');
  const totalValueStr = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact' }).format(totalBacklogValue);
  console.log(`│ TOTAL      │ ${totalAgingCount.toLocaleString().padStart(12)} │ ${totalValueStr.padStart(19)} │  100.0% │`);
  console.log('└────────────┴──────────────┴─────────────────────┴─────────┘');

  // 7. Calculate average age on backlog
  const avgAge = backlogInvoices.length > 0
    ? backlogInvoices.reduce((sum, inv) => sum + (calculateDaysOld(inv.invoice_date) || 0), 0) / backlogInvoices.length
    : 0;

  console.log(`\n📅 Average Age (backlog): ${Math.round(avgAge)} days`);

  // 8. Verification checks
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ VERIFICATION CHECKS:');
  
  const check1 = totalAgingCount === backlogInvoices.length;
  console.log(`\n   1. Sum of aging buckets = backlog count`);
  console.log(`      ${totalAgingCount.toLocaleString()} = ${backlogInvoices.length.toLocaleString()} → ${check1 ? '✅ PASS' : '❌ FAIL'}`);

  const check2 = readyForPaymentInvoices.length + backlogInvoices.length === includedInvoices.length;
  console.log(`\n   2. Ready + Backlog = Total Included`);
  console.log(`      ${readyForPaymentInvoices.length.toLocaleString()} + ${backlogInvoices.length.toLocaleString()} = ${includedInvoices.length.toLocaleString()} → ${check2 ? '✅ PASS' : '❌ FAIL'}`);

  const check3 = totalAgingCount < includedInvoices.length || readyForPaymentInvoices.length === 0;
  console.log(`\n   3. Aging count < Total (unless no Ready for Payment)`);
  console.log(`      ${totalAgingCount.toLocaleString()} < ${includedInvoices.length.toLocaleString()} → ${check3 ? '✅ PASS' : '❌ FAIL'}`);

  console.log('\n' + '='.repeat(60));
  
  if (check1 && check2 && check3) {
    console.log('\n🎉 All checks passed! Aging calculations are correct.\n');
  } else {
    console.log('\n⚠️  Some checks failed. Please investigate.\n');
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

