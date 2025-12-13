# Product Requirements Document (PRD)
# SKG Payables Invoice Analytics Dashboard

**Version:** 1.0  
**Last Updated:** December 2024  
**Product Owner:** Saskatchewan Health Authority (3sHealth)

---

## 1. Executive Summary

### 1.1 Product Vision
The SKG Payables Invoice Analytics Dashboard is a web-based analytics platform designed to provide real-time visibility into accounts payable invoice aging, processing status, and workflow efficiency. The application enables finance teams to monitor outstanding invoices, identify bottlenecks in the approval process, track trends over time, and manage outlier invoices that require special attention.

### 1.2 Problem Statement
Finance teams managing large volumes of invoices lack a centralized, visual tool to:
- Quickly understand the aging profile of outstanding invoices
- Identify invoices stuck in specific workflow states
- Compare current invoice volumes against previous periods
- Flag and manage outlier invoices (high-value or negative amounts)
- Export data for reporting and audit purposes

### 1.3 Target Users
- **Primary:** Accounts Payable Analysts and Managers
- **Secondary:** Finance Directors, Auditors, and Business Unit Managers

---

## 2. Product Overview

### 2.1 Core Capabilities

| Capability | Description |
|------------|-------------|
| **Data Import** | Upload CSV exports from SKG Payables system |
| **Dashboard Analytics** | Visual KPIs, charts, and breakdowns of invoice data |
| **Invoice Browser** | Searchable, filterable list of all invoices |
| **Aging Analysis** | Detailed aging breakdown by monthly buckets |
| **Outlier Management** | Identify and manage high-value and negative invoices |
| **Batch Comparison** | Compare current vs. previous imports to track changes |
| **Export & Reporting** | CSV export and print-ready reports |

### 2.2 Technology Stack

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18+ with TypeScript |
| **Build Tool** | Vite |
| **Styling** | Tailwind CSS |
| **Charts** | Recharts |
| **Backend/Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth |
| **Deployment** | Docker + Nginx |

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization

#### FR-AUTH-001: User Authentication
- Users must authenticate via email/password
- Support for new user registration
- Session persistence across browser refreshes
- Secure logout functionality

#### FR-AUTH-002: Protected Routes
- All application routes require authentication
- Unauthenticated users redirected to login page
- Session timeout after extended inactivity

---

### 3.2 Data Import

#### FR-IMP-001: CSV File Upload
- Drag-and-drop or click-to-upload interface
- Support for both CSV (comma-delimited) and TSV (tab-delimited) files
- Auto-detection of delimiter format
- File size indicator during upload
- Progress indicator during import

#### FR-IMP-002: Data Parsing & Mapping
The system shall parse CSV files with the following column mappings:

| CSV Column | Database Field |
|------------|----------------|
| INVOICE_DATE | invoice_date |
| INVOICE_ID | invoice_id |
| CREATION_DATE | creation_date |
| BUSINESS_UNIT | business_unit |
| SUPPLIER_NAME | supplier |
| SUPPLIER_TYPE | supplier_type |
| INVOICE_NUM | invoice_number |
| INVOICE_AMOUNT | invoice_amount |
| PAYMENT_METHOD_CODE | payment_method |
| PAYMENT_TERMS | payment_terms |
| INVOICE_TYPE | invoice_type |
| PO_NONPO | po_type |
| CODED_BY | coded_by |
| APPROVER_ID | approver_id |
| APPROVAL_RESPONSE | approval_response |
| APPROVAL_DATE | approval_date |
| INVOICE_PROCESS_STATUS | overall_process_state |
| PAYMENT_AMOUNT | payment_amount |
| PAYMENT_DATE | payment_date |
| PO_NUMBER | identifying_po |
| ROUTING_ATTRIBUTE1-4 | routing_attribute1-4 |

#### FR-IMP-003: Automatic Filtering During Import
The following invoices shall be automatically excluded during import:
- **Zero-value invoices:** Invoice amount = $0
- **Fully paid invoices:** Process state starts with "09" or contains "Fully Paid"

#### FR-IMP-004: Outlier Detection
During import, the system shall flag invoices as outliers:
- **High-value outliers:** Amount > $100,000 AND process state = "01 - Header To Be Verified"
- **Negative amount outliers:** Any invoice with amount < $0

**Default Behavior:** Outliers are excluded from dashboard analytics by default and must be explicitly included.

#### FR-IMP-005: Calculated Fields
- **days_old:** Dynamically calculated as (Current Date - Invoice Date) in days
- **po_type:** Normalized from "Yes"/"No" to "PO"/"Non-PO"

#### FR-IMP-006: Import Batch Management
- Each import creates a new batch record
- Most recent batch marked as "current" and used for all analytics
- Import history maintained with ability to delete batches (most recent first)
- Batch deletion cascades to associated invoices

#### FR-IMP-007: Import Summary
After import, display:
- Total records imported
- Records skipped (with breakdown: fully paid, zero-value)
- Outliers detected (with breakdown: high-value, negative)

---

### 3.3 Dashboard

#### FR-DASH-001: Summary Statistics Cards
Display four primary KPI cards:
1. **Total Invoices:** Count and total value
2. **Ready for Payment:** Invoices in "08 - Ready for Payment" state
3. **Requires Investigation:** Invoices with "Investigation" in process state
4. **Average Age:** Mean days old across all invoices

#### FR-DASH-002: Aging Distribution Chart
- Horizontal bar chart showing invoice distribution by aging buckets
- Buckets: 0-30, 30-60, 60-90, 90+ days
- Toggle between Count view and Value view
- Color-coded by severity (green → red as age increases)

#### FR-DASH-003: Monthly Aging Breakdown
- Detailed bar chart with 30-day increments from 0-360+ days
- Each bucket shows count and value
- Summary statistics for key ranges (0-90, 90-180, 180-270, 270-360, 360+)
- Clickable buckets to navigate to filtered invoice list

#### FR-DASH-004: Process State Distribution
- Horizontal bar chart showing invoices by workflow state
- Sorted by count (descending)
- Clickable to filter invoice list by state

#### FR-DASH-005: Top Vendors Table
- List of top 10 vendors by invoice count
- Columns: Vendor Name, Invoice Count, Total Value
- Clickable vendor names to filter invoice list

#### FR-DASH-006: PO vs Non-PO Breakdown
- Pie chart showing distribution of PO vs Non-PO invoices
- Count and value for each category
- Clickable segments to filter invoice list

#### FR-DASH-007: Batch Comparison Panel
Compare current import against previous import:
- Net change in invoice count
- Resolved invoices (present in previous, absent in current)
- New invoices (absent in previous, present in current)
- Value change summary
- Status changes breakdown

#### FR-DASH-008: Trend Chart
- Line chart showing invoice counts across multiple import batches
- Visual trend of aging invoice volume over time

---

### 3.4 Invoice Browser

#### FR-INV-001: Invoice List View
- Paginated table of all invoices (20 per page)
- Columns: Invoice #, Vendor, Amount, Days Old, Approver, Status, PO#, Coded By, Payment Method

#### FR-INV-002: Sorting
- Click column headers to sort ascending/descending
- Default sort: Days Old (descending)
- Sort indicator on active column

#### FR-INV-003: Filtering
Filters available:
- Search (vendor or invoice number)
- Process State (dropdown)
- PO Type (dropdown)
- Supplier Type (dropdown)
- Payment Method (dropdown)
- Amount Range (min/max)
- Days Old Range (min/max)

#### FR-INV-004: URL Parameter Support
- Filters applied via URL query parameters
- Supports direct links from dashboard charts
- Parameters: vendor, state, poType, minDays, maxDays, minAmount, maxAmount

#### FR-INV-005: Invoice Detail Modal
Click invoice row to view full details:
- All invoice fields in organized sections
- Invoice identification
- Supplier information
- Approval workflow details
- Payment information
- Routing attributes

#### FR-INV-006: CSV Export
- Export current filtered results to CSV
- All displayed columns included
- Filename format: `invoices_export_YYYY-MM-DD.csv`

---

### 3.5 Aging Analysis Page

#### FR-AGE-001: Detailed Aging Breakdown
- Monthly buckets from 0-30 through 360+ days
- For each bucket: Count, Total Value, Average Amount

#### FR-AGE-002: Bucket Detail View
- Click bucket to expand details
- Top vendors within that aging bucket
- Individual invoice preview with amounts

#### FR-AGE-003: Interactive Charts
- Composed bar chart with count bars and value line
- Pie chart showing value distribution across buckets
- Toggle between count and value views

#### FR-AGE-004: Drill-down Navigation
- Click any bucket to navigate to Invoices page pre-filtered by days old range

---

### 3.6 Outlier Management

#### FR-OUT-001: Outlier List View
- Display all detected outliers from current batch
- Columns: Inclusion Toggle, Type (High Value/Negative), Invoice #, Vendor, Amount, Status, Days Old

#### FR-OUT-002: Outlier Types
- **High Value:** Amount > $100,000 with "01 - Header To Be Verified" state
- **Negative:** Any invoice with negative amount

#### FR-OUT-003: Inclusion Toggle
- Per-invoice toggle to include/exclude from analysis
- Visual indicator (green = included, gray = excluded)
- Immediate effect on dashboard statistics

#### FR-OUT-004: Default Behavior
- All outliers excluded from analysis by default
- Must be explicitly set to "included" to appear in dashboard stats

#### FR-OUT-005: Bulk Actions
- "Include All" button to include all filtered outliers
- "Exclude All" button to exclude all filtered outliers
- Confirmation dialog for bulk actions

#### FR-OUT-006: Filtering
- Filter by type: All, High Value, Negative
- Filter by inclusion status: All, Included, Excluded
- Search by vendor or invoice number
- Filter by process state
- Filter by amount range
- Filter by days old range

#### FR-OUT-007: Statistics Summary
Display outlier statistics:
- Total outliers detected
- Count by type (high value, negative)
- Included vs. excluded count
- Total value and included value

#### FR-OUT-008: Export & Print
- CSV export of filtered outliers
- Print-ready report with summary and detail table

---

### 3.7 Reporting & Export

#### FR-REP-001: CSV Export
Available on:
- Invoice list (filtered results)
- Outlier list (filtered results)
- Dashboard data points

#### FR-REP-002: Print Reports
- Print-formatted reports with header, summary, and data tables
- Date and filter information included
- Professional styling for printed output

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Requirement | Target |
|-------------|--------|
| Page load time | < 2 seconds |
| Dashboard render | < 3 seconds with 50,000 invoices |
| CSV import | < 30 seconds for 10,000 records |
| API response time | < 500ms for paginated queries |

### 4.2 Scalability
- Support up to 100,000 invoices per import batch
- Pagination for large datasets (1,000 records per page API-side)
- Efficient database indexing on key query fields

### 4.3 Security
- Authentication required for all features
- Row-level security on database tables
- XSS prevention in print/export outputs
- HTTPS enforcement in production

### 4.4 Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 4.5 Accessibility
- Keyboard navigation support
- ARIA labels on interactive elements
- Sufficient color contrast for charts
- Screen reader compatibility

---

## 5. Data Model

### 5.1 Core Entities

#### Import Batch
```
import_batches
├── id (UUID, PK)
├── filename (TEXT)
├── record_count (INTEGER)
├── skipped_count (INTEGER)
├── skipped_fully_paid (INTEGER)
├── skipped_zero_value (INTEGER)
├── outlier_count (INTEGER)
├── outlier_high_value (INTEGER)
├── outlier_negative (INTEGER)
├── imported_at (TIMESTAMPTZ)
├── imported_by (UUID, FK → auth.users)
├── is_current (BOOLEAN)
└── is_deleted (BOOLEAN)
```

#### Invoice
```
invoices
├── id (UUID, PK)
├── invoice_date (DATE)
├── invoice_id (TEXT)
├── creation_date (DATE)
├── business_unit (TEXT)
├── supplier (TEXT)
├── supplier_type (TEXT)
├── invoice_number (TEXT)
├── invoice_amount (NUMERIC)
├── payment_method (TEXT)
├── payment_terms (TEXT)
├── invoice_type (TEXT)
├── po_type (TEXT)
├── coded_by (TEXT)
├── approver_id (TEXT)
├── approval_response (TEXT)
├── approval_date (DATE)
├── overall_process_state (TEXT)
├── payment_amount (NUMERIC)
├── payment_date (DATE)
├── identifying_po (TEXT)
├── routing_attribute1-4 (TEXT)
├── days_old (INTEGER)
├── import_batch_id (UUID, FK)
├── imported_at (TIMESTAMPTZ)
├── is_outlier (BOOLEAN)
├── outlier_reason (TEXT)
└── include_in_analysis (BOOLEAN)
```

### 5.2 Database Indexes
- `idx_invoices_batch` on import_batch_id
- `idx_invoices_supplier` on supplier
- `idx_invoices_days_old` on days_old
- `idx_invoices_process_state` on overall_process_state
- `idx_invoices_approver` on approver_id
- `idx_import_batches_current` on is_current

---

## 6. User Interface Design

### 6.1 Design System

#### Color Palette
- **Primary:** Sky Blue (#0ea5e9)
- **Background:** Slate (#0f172a → #1e293b)
- **Success:** Emerald (#10b981)
- **Warning:** Amber (#f59e0b)
- **Danger:** Red (#ef4444)
- **Purple (Negative amounts):** Violet (#8b5cf6)

#### Typography
- **Font Family:** System fonts (native stack)
- **Headings:** Bold, White
- **Body:** Regular, Slate-300/400
- **Labels:** Small, Uppercase, Slate-400

#### Component Patterns
- **Cards:** Rounded corners, subtle borders, glass-morphism effect
- **Buttons:** Primary (sky gradient), Secondary (slate)
- **Tables:** Striped rows, hover states, sticky headers
- **Modals:** Centered, backdrop blur, slide-in animation

### 6.2 Navigation
- Persistent sidebar navigation
- Menu items: Dashboard, Invoices, Aging, Outliers, Import
- Current page indicator
- Collapsible on mobile

### 6.3 Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Stacked layouts on mobile, grid layouts on desktop
- Touch-friendly controls

---

## 7. Integration Points

### 7.1 Data Source
- **Input:** CSV export from SKG Payables system
- **Format:** Comma or tab-separated values
- **Encoding:** UTF-8
- **Date Format:** ISO 8601 (YYYY-MM-DD or with timezone)

### 7.2 Authentication Provider
- Supabase Auth (email/password)
- Future: SSO integration capability

### 7.3 Deployment
- Docker containerization
- Nginx reverse proxy
- Environment variables for configuration

---

## 8. Future Enhancements (Roadmap)

### Phase 2
- [ ] Email notifications for aging thresholds
- [ ] Scheduled automatic imports
- [ ] Custom dashboard widgets
- [ ] User-configurable outlier thresholds

### Phase 3
- [ ] Role-based access control (RBAC)
- [ ] Business unit filtering
- [ ] API access for external systems
- [ ] Audit trail logging

### Phase 4
- [ ] Predictive analytics for invoice aging
- [ ] Vendor performance scoring
- [ ] Workflow automation recommendations
- [ ] Mobile application

---

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Time to identify stuck invoices | < 1 minute |
| Reduction in aging invoice volume | 20% within 6 months |
| User adoption rate | 90% of AP team |
| Data freshness | Daily imports |
| Report generation time | < 10 seconds |

---

## 10. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Aging** | Number of days since invoice date |
| **Outlier** | Invoice flagged for special handling (high value or negative) |
| **Batch** | A single import of invoice data |
| **Process State** | Current workflow status of an invoice |
| **PO** | Purchase Order |

### B. Process State Reference

| Code | Description |
|------|-------------|
| 01 | Header To Be Verified |
| 02 | Pending Coding |
| 03 | Pending Approval |
| 04 | Approved - Pending Validation |
| 05 | Ready for Posting |
| 06 | Posted |
| 07 | Investigation |
| 08 | Ready for Payment |
| 09 | Fully Paid |

### C. Aging Bucket Definitions

| Bucket | Days Range | Severity |
|--------|------------|----------|
| 0-30 | 0-29 | Current |
| 30-60 | 30-59 | Attention |
| 60-90 | 60-89 | Warning |
| 90-120 | 90-119 | Overdue |
| 120-150 | 120-149 | Critical |
| 150-180 | 150-179 | Severe |
| 180-210 | 180-209 | Severe |
| 210-240 | 210-239 | Severe |
| 240-270 | 240-269 | Extreme |
| 270-300 | 270-299 | Extreme |
| 300-330 | 300-329 | Extreme |
| 330-360 | 330-359 | Extreme |
| 360+ | 360+ | Maximum |

---

*Document End*



