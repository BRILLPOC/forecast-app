# Clinical Supply Forecast POC

## Overview
This project implements a clinical supply chain forecasting system for trial demand planning and scenario analysis.

## Task Completion Status

### ✅ Task 1 – Snowflake Setup & Environment Configuration
**Status: COMPLETE**

#### Completed Items:
- ✓ Virtual environment created (`.venv`)
- ✓ Required packages installed:
  - snowflake-connector-python (4.3.0+)
  - pandas (3.0.1+)
  - numpy (2.4.2+)
  - plotly (6.5.2+)
  - python-dotenv (1.2.1+)
- ✓ Environment variables configured in `.env`
- ✓ Snowflake connectivity validated (version 10.6.2)

#### Acceptance Criteria Met:
- ✓ Successful connection to Snowflake POC
- ✓ All required libraries installed and importable
- ✓ README documenting environment setup

---

### ✅ Task 2 – Data Extraction & Validation
**Status: COMPLETE**

#### Completed Items:
- ✓ Created `src/data_loader.py` with reusable query functions
- ✓ Created `src/diagnostics.py` for validation and debugging
- ✓ Created `main.py` with CLI commands for exploration

#### Discovered Schema (15 Tables):

**Core Reference Data:**
- `PROGRAM` (4 rows) - Program IDs
- `TRIALS` (24 rows) - Trial definitions
- `ITEMS` (120 rows) - Item/Product definitions
- `TRIAL_COUNTRIES` (120 rows) - Countries and regions per trial

**Enrollment & Dosing Data:**
- `PLANNED_ENROLLMENTS` (25,920 rows) - Monthly enrollment by cohort/treatment/country
- `TRIAL_DOSING` (24 rows) - Dosing versions
- `TRIAL_DOSING_INTERVALS` (25,920 rows) - Dosing qty/overage by interval
- `TRIAL_ENROLLMENT` (24 rows) - Enrollment versions
- `COHORT_TREATMENT_GROUPS` (216 rows) - Cohort-treatment mappings

**Demand & Supply Planning:**
- `DEMAND_SCENARIO` (24 rows) - Demand scenario definitions
- `DEMAND_SCENARIO_DEMAND` (14,400 rows) - Scenario demand data
- `SUPPLY_PLANNING` (24 rows) - Supply plan definitions
- `SUPPLY_PLANNING_DEMAND` (2,880 rows) - Supply planning demand
- `TRIAL_UTILIZATION` (24 rows) - Utilization versions
- `TRIAL_UTILIZATION_DEMAND` (129,600 rows) - Utilization demand by country/month

#### Acceptance Criteria Met:
- ✓ Scripts return correct tables for selected trial
- ✓ Basic data integrity checks implemented
- ✓ Key relationships (trial_seq, cohort, treatment_group) validated

---

## Environment Setup Instructions

### Prerequisites
- Python 3.13+
- Snowflake account credentials

### Setup Steps

1. **Clone repository and navigate to project:**
   ```bash
   cd forecast-app
   ```

2. **Create and activate virtual environment:**
   ```bash
   python -m venv .venv
   .venv\Scripts\Activate.ps1  # Windows
   source .venv/bin/activate   # macOS/Linux
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   Create `.env` file with your Snowflake credentials

5. **Validate connection:**
   ```bash
   python -m src.validate_connection
   ```

6. **Explore the schema:**
   ```bash
   python main.py explore
   ```

---

## Usage Examples

### Explore Schema
```bash
python main.py explore
```

### Load Sample Data
```bash
python main.py load PLANNED_ENROLLMENTS 100
```

### Execute Custom Query
```bash
python main.py query "SELECT TRIAL_ID FROM TRIALS LIMIT 5"
```

### Run Diagnostics
```bash
python -m src.diagnostics
```

---

## Next Steps

### Task 3 – Baseline Demand Calculation
Implement demand computation logic that joins enrollment and dosing data and calculates demand.

### Task 4 – Scenario Modeling
Create scenario engine for "what-if" analysis with enrollment reductions by region.

### Task 5 – Demand Comparison & Variance
Compare baseline vs scenario with variance calculations.

### Task 6 – Visualization & Presentation
Create interactive UI and visualizations for demand forecasts.
