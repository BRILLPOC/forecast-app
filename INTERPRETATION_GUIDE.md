# Understanding Baseline Demand Output & Scenario Comparison

## What the Baseline Demand Output Means

### 1. **Data Loading Phase**
```
✓ Enrollments loaded: 1080 rows
✓ Dosing intervals loaded: 1080 rows
✓ Countries loaded: 5 rows
✓ Items loaded: 5 rows
```

**Interpretation:**
- **1,080 enrollment records** = Different combinations of month/cohort/treatment/country
- **1,080 dosing intervals** = Dosing schedules for each cohort/treatment/item
- **5 countries** = Trial operates in 5 different countries
- **5 items** = 5 different drugs/products being distributed

### 2. **Data Validation**
```
✓ No missing join keys
✓ Total patients in enrollments: 15,919
```

**What it checks:**
- ✓ All records have required join keys (cohort + treatment_group)
- ✓ Total of **15,919 patients** will be enrolled across the entire trial
- ✓ No gaps or mismatches in the data

### 3. **Data Joining**
```
✓ Merged data: 129,600 rows
```

**What happened:**
- 1,080 enrollment records × ~120 dosing intervals per enrollment = 129,600 rows
- Each enrollment is joined with multiple dosing intervals (months of treatment)
- Each row represents: 1 patient × 1 dosing interval

**Example:**
```
Patient Alice from Germany, enrolled in Month 1, on Drug A
+ Drug A has 120 monthly dosing intervals
= 120 rows of demand data for Alice
```

### 4. **Demand Calculation Summary**
```
✓ Total demand records: 1,175
✓ Total demand quantity: 5,571,768 units
✓ Total patients: 1,910,280
✓ Consumption months range: 2 - 48
✓ Countries: 5
✓ Items: 5
```

**Key Metrics:**

| Metric | Value | Meaning |
|--------|-------|---------|
| **Total Demand Records** | 1,175 | Unique (month, country, item) combinations |
| **Total Demand Quantity** | 5,571,768 units | Total drugs needed across entire trial |
| **Total Patients** | 1,910,280 | Sum of all enrollments × dosing intervals |
| **Months Range** | 2-48 | Demand spans 47 months (nearly 4 years) |
| **Countries** | 5 | Spread across 5 geographic regions |
| **Items** | 5 | 5 different drug products |

**What this means for supply chain:**
- Need to distribute **5.57 million units** across 5 countries
- Demand spans nearly 4 years
- Peak demand will occur at specific months (need to identify which month has highest demand)

### 5. **Spot Check - Calculation Verification**
```
Enrollments: 12 patients
Base Qty: 2 units per patient per interval
Overage: 10.2% (safety stock)
Calculated: 12 × 2 × (1 + 0.102) = 26.45 units
Rounded: 27 units
```

**How the formula works:**

```
Demand = Enrollments × Base Quantity × (1 + Overage)

Example:
- 12 patients enroll
- Each needs 2 units per month of treatment
- Add 10.2% overage for safety/waste
- Total: 12 × 2 × 1.102 = 26.45 ≈ 27 units (rounded up)
```

**Why overage?**
- Account for spills/breakage
- Ensure no stockouts
- Buffer for patient non-compliance
- Safety margin for supply chain

---

## How Scenario Comparison Works

### **The Process (Step-by-Step)**

#### **Step 1: Start with Baseline**
```
Baseline Demand = As calculated above (5,571,768 units)
```

#### **Step 2: Define a Scenario**
```python
Scenario: "EU Region Slowdown"
- Affected Countries: Germany, France, Italy, Spain, UK
- Reduction Factor: 30%
- Start Month: 3
```

**What this means:**
- EU countries will have 30% FEWER patients than baseline
- Reduction applies from month 3 onwards
- Non-EU countries remain unchanged (baseline)

#### **Step 3: Modify Enrollments**
```
Original Enrollments in Germany Month 3: 100 patients
Scenario Enrollments in Germany Month 3: 100 × (1 - 0.30) = 70 patients

Original Enrollments in Germany Month 1-2: 100 patients (unchanged)
Scenario Enrollments in Germany Month 1-2: 100 patients (unchanged)
```

#### **Step 4: Recompute Demand with Modified Enrollments**
```
Original Demand in Germany Month 3: 100 × 2 × 1.102 = 220.4 units
Scenario Demand in Germany Month 3: 70 × 2 × 1.102 = 154.3 units
```

#### **Step 5: Calculate Variance**
```
Variance = Scenario Demand - Baseline Demand
         = 154.3 - 220.4 = -66.1 units (REDUCTION)

Percentage Change = (Variance / Baseline) × 100
                  = (-66.1 / 220.4) × 100 = -30%
```

---

## Real Example with Numbers

### **Trial 1 Data:**

**Baseline (No Scenario):**
```
Country: Germany
Item: Drug A
Month: 3

Baseline Enrollment: 100 patients
Baseline Demand: 100 × 2 units × 1.102 overage = 220 units
```

**Scenario (30% EU Reduction from Month 3):**
```
Country: Germany
Item: Drug A
Month: 3

Scenario Enrollment: 100 × (1 - 0.30) = 70 patients
Scenario Demand: 70 × 2 units × 1.102 overage = 154 units
```

**Comparison:**
```
Baseline Demand:    220 units
Scenario Demand:    154 units
Variance:            -66 units (FEWER units needed)
Percentage Change:  -30% (matches our reduction factor)
```

**Business Impact:**
- Reduce production by 66 units for this month/country/item
- Save 30% of supply for this combination
- Multiply across all combinations = significant overall impact

---

## Interpretation Summary

### **What the Numbers Tell Us:**

1. **Trial Size**: 1,910,280 total enrollments
   - Large-scale trial spanning multiple countries

2. **Supply Volume**: 5.57 million units total
   - Significant manufacturing and logistics requirement
   - Multiple distribution points needed

3. **Timeline**: 47 months (almost 4 years)
   - Long-term commitment
   - Demand likely varies by month

4. **Geographic Spread**: 5 countries
   - Need regional supply chain
   - Different regulatory requirements per country

5. **Product Complexity**: 5 items
   - Multiple drug products
   - Potential for substitution/alternatives

---

## How to Use This for Business Decisions

### **Question 1: Can we handle this volume?**
- Total demand: 5.57M units
- Timeframe: 47 months
- Average monthly: ~118,000 units
- **Decision**: Check manufacturing capacity

### **Question 2: What if EU enrollment drops 30%?**
- Total reduction: ~1.67M units (30% of 5.57M)
- Monthly reduction: ~35,500 units
- **Decision**: Scale back EU operations, redirect capacity

### **Question 3: When is peak demand?**
- Look at which month has highest demand
- From output: demand spans months 2-48
- **Decision**: Highest inventory needed at peak month

### **Question 4: Which items are most critical?**
- Items with highest total demand
- Items with highest per-patient requirements
- **Decision**: Prioritize sourcing for critical items

---

## Visual Example: Month-by-Month Comparison

```
Month 1-2: No reduction (EU not affected yet)
   Baseline:  100,000 units
   Scenario:  100,000 units
   Variance:        0 units

Month 3-10: EU slowdown starts
   Baseline:  100,000 units
   Scenario:   70,000 units (30% reduction)
   Variance:  -30,000 units

Month 11+: Continues until end of trial
   Baseline:  100,000 units
   Scenario:   70,000 units
   Variance:  -30,000 units
```

**Total Impact Over 47 Months:**
- If 40 months affected: 40 × 30,000 = 1.2M fewer units needed
- Cost savings, reduced inventory, less waste

---

## Key Takeaway

**Scenario comparison answers: "What if?" questions**

- What if we lose 30% of EU patients?
- What if we need to expand in Asia?
- What if manufacturing capacity drops?

By changing one parameter and recomputing, you get instant financial and operational impact!

---

## Next Steps

To see this in action:

1. **Run the notebook** to see actual charts
2. **Try different scenarios**:
   ```python
   # 50% reduction instead of 30%
   reduction_factor=0.50
   
   # Different countries
   affected_countries=['Germany', 'France']
   
   # Earlier start
   start_month=1
   ```
3. **Compare results** - see how sensitive demand is to changes
4. **Export for stakeholders** - share the insights
