# Batch Delete Functionality Test Plan

## Expected Behavior

When a batch is deleted, the comparison should automatically recalculate using the batch before the deleted one.

### Scenario 1: Delete Middle Batch
**Setup:**
- Batch A: Dec 5, 2025 (current, is_current=true)
- Batch B: Dec 4, 2025 (previous)
- Batch C: Dec 3, 2025 (older)

**Action:** Delete Batch B

**Expected Result:**
- Batch A remains current
- Comparison should show: Batch A vs Batch C
- As if Batch B never existed

### Scenario 2: Delete Current Batch
**Setup:**
- Batch A: Dec 5, 2025 (current, is_current=true)
- Batch B: Dec 4, 2025 (previous)
- Batch C: Dec 3, 2025 (older)

**Action:** Delete Batch A

**Expected Result:**
- Batch B becomes current (is_current=true)
- Comparison should show: Batch B vs Batch C
- Batch A is completely removed

### Scenario 3: Delete Previous Batch
**Setup:**
- Batch A: Dec 5, 2025 (current, is_current=true)
- Batch B: Dec 4, 2025 (previous)
- Batch C: Dec 3, 2025 (older)

**Action:** Delete Batch B

**Expected Result:**
- Batch A remains current
- Comparison should show: Batch A vs Batch C
- Batch B is completely removed

## Implementation Details

1. **Comparison Logic:**
   - Uses batch with `is_current=true` as "current"
   - Finds most recent batch with `imported_at < currentBatch.imported_at` as "previous"
   - This automatically skips deleted batches

2. **Event System:**
   - After deletion, dispatches `batchDeleted` event
   - All components listen for this event and refresh
   - Comparison hook automatically refetches

3. **Database Operations:**
   - Deletes all invoices with matching `import_batch_id`
   - Deletes the batch record
   - If deleted batch was current, sets most recent remaining as current

## Testing Checklist

- [ ] Delete middle batch - comparison updates correctly
- [ ] Delete current batch - new current batch is set
- [ ] Delete previous batch - comparison skips to older batch
- [ ] Batch list refreshes immediately
- [ ] Dashboard stats refresh automatically
- [ ] Comparison panel updates automatically
- [ ] No errors in console
- [ ] Database is in consistent state after deletion

