# 📸 Screenshot Capture Checklist

Use this checklist to capture all screenshots needed for the User Guide.

## Recommended Tools
- **Windows Snipping Tool**: Press `Win + Shift + S`
- **Browser DevTools**: F12 → Device Toolbar for consistent sizing
- **Recommended Resolution**: 1920 x 1080 (or capture at 100% zoom)

## Tips for Good Screenshots
1. Use realistic sample data (not empty screens)
2. Ensure no sensitive information is visible
3. Capture at 100% browser zoom
4. Include relevant UI context (don't crop too tight)
5. Use PNG format for best quality

---

## 1. Login & Navigation

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `01-login-screen.png` | Login page | Log out, capture the login form |
| ✅ | `02-sidebar-navigation.png` | Sidebar menu | Capture left sidebar with all menu items visible |

---

## 2. Dashboard

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `03-dashboard-overview.png` | Full dashboard | Scroll to top, capture entire visible area |
| ⬜ | `03a-data-source.png` | Data source indicator | Crop header area showing filename/date |
| ✅ | `03b-kpi-cards.png` | KPI statistics cards | Capture the row of 5 stat cards |
| ✅ | `03c-batch-comparison.png` | Batch comparison panel | Capture the comparison section |
| ⬜ | `03d-trend-chart.png` | Trend chart | Capture the line chart area |
| ✅ | `03e-aging-distribution.png` | Aging bar chart | Capture the aging distribution chart |
| ✅ | `03f-process-state-chart.png` | Process state chart | Capture the horizontal bar chart |
| ✅ | `03g-monthly-aging.png` | Monthly aging breakdown | Capture detailed 30-day bucket chart |
| ✅ | `03h-po-breakdown.png` | PO vs Non-PO pie chart | Capture the pie chart section |
| ✅ | `03i-top-vendors.png` | Top vendors table | Capture the vendor table |

---

## 3. Invoice Browser

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `04-invoice-browser.png` | Full page | Navigate to Invoices, capture full view |
| ✅ | `04a-search-bar.png` | Search bar | Crop the search input area |
| ⬜ | `04b-filter-panel.png` | Expanded filters | Click Filters button, capture expanded panel |
| ⬜ | `04c-invoice-table.png` | Data table with data | Capture table with invoice rows visible |
| ⬜ | `04d-sort-indicators.png` | Column sorting | Click a column header, capture the sorted column |
| ⬜ | `04e-invoice-modal.png` | Detail modal | Click an invoice row, capture the popup |
| ⬜ | `04f-pagination.png` | Pagination controls | Capture the bottom pagination bar |

---

## 4. Aging Analysis

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `05-aging-analysis.png` | Full page | Navigate to Aging, capture full view |
| ⬜ | `05a-summary-cards.png` | Summary cards | Capture the top row of cards |
| ⬜ | `05b-distribution-chart.png` | Distribution chart | Capture the bar/line combo chart |
| ⬜ | `05c-bucket-grid.png` | Bucket selection grid | Capture all the clickable bucket cards |
| ⬜ | `05d-bucket-details.png` | Selected bucket details | Click a bucket, capture the expanded detail |
| ⬜ | `05e-pie-charts.png` | Count/Value pie charts | Capture both pie charts side by side |

---

## 5. Outliers

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `06-outliers-page.png` | Full page | Navigate to Outliers, capture full view |
| ⬜ | `06a-outlier-stats.png` | Statistics cards | Capture the stat cards row |
| ⬜ | `06b-export-print.png` | Export/Print buttons | Capture the top-right action buttons |
| ⬜ | `06c-bulk-actions.png` | Bulk action buttons | Capture the bulk action controls |
| ⬜ | `06d-amount-range.png` | Amount range controls | Capture the min/max amount inputs |
| ⬜ | `06e-outlier-filters.png` | Filter controls | Capture all filter options |
| ⬜ | `06f-outlier-table.png` | Outlier table | Capture table with toggle switches visible |
| ⬜ | `06g-toggle-switch.png` | Toggle switch detail | Crop a close-up of the toggle switch |

---

## 6. Import

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ✅ | `07-import-page.png` | Full page | Navigate to Import, capture full view |
| ✅ | `07a-upload-zone.png` | Upload area | Capture the drag-and-drop zone |
| ⬜ | `07b-zip-selection.png` | ZIP file selection | Upload a ZIP with multiple CSVs, capture dialog |
| ⬜ | `07c-import-progress.png` | Progress indicator | Start an import, capture during progress |
| ⬜ | `07d-import-complete.png` | Success screen | Capture after successful import |
| ⬜ | `07e-import-error.png` | Error screen | Trigger an error (bad file), capture |
| ✅ | `07f-import-history.png` | History table | Capture the batch history table |
| ⬜ | `07g-delete-modal.png` | Delete confirmation | Click Delete on a batch, capture modal |
| ✅ | `07h-instructions.png` | Instructions panel | Capture the right-side instructions card |

---

## 7. Export & Print

| Status | Filename | Description | How to Capture |
|--------|----------|-------------|----------------|
| ⬜ | `08a-export-csv.png` | Export CSV button | Capture the button on Invoices page |
| ⬜ | `08b-print-report.png` | Print Report button | Capture the button on Invoices page |
| ⬜ | `08c-print-preview.png` | Print preview window | Click Print Report, capture new window |
| ⬜ | `08d-outlier-export.png` | Outlier export | Capture export button on Outliers page |
| ⬜ | `08e-outlier-print.png` | Outlier print | Capture print button on Outliers page |

---

## Quick Reference: Screenshot Dimensions

| Type | Recommended Size |
|------|------------------|
| Full page | 1920 x 1080 or browser viewport |
| Component | 800-1200px wide |
| Detail/Crop | 400-600px wide |
| Button/Icon | 200-300px wide |

---

## After Capturing

1. Save all screenshots to this `screenshots/` folder
2. Use the exact filenames listed above
3. Open `USER_GUIDE.html` in a browser to preview
4. The Markdown version (`USER_GUIDE.md`) references the same images

---

*Mark each screenshot with ✅ when captured!*

