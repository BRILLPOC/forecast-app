"""
Task 3: Baseline Demand Calculation

This module implements the baseline demand computation logic that:
1. Loads enrollment and dosing data from Snowflake
2. Joins enrollments with dosing intervals
3. Calculates consumption months (enrollment_month + interval_number)
4. Computes demand per interval (planned_enrollments × qty × (1 + overage))
5. Aggregates demand by month, country, and item

Key Functions:
- get_trial_enrollments(trial_seq) - Load enrollment data for a trial
- get_trial_dosing_intervals(trial_seq, dosage_version) - Load dosing intervals
- get_trial_countries(trial_seq) - Map countries to regions
- get_trial_items(trial_seq) - Load item information
- compute_baseline_demand(trial_seq, enroll_version, dosage_version) - Main computation
"""

import pandas as pd
import numpy as np
from .data_loader import load_table_data, execute_query


def get_trial_enrollments(trial_seq: int, enroll_version: int = None) -> pd.DataFrame:
    """
    Load planned enrollments for a specific trial.
    
    Args:
        trial_seq: Trial sequence number
        enroll_version: Enrollment version (if None, uses latest)
    
    Returns:
        DataFrame with columns: TRIAL_SEQ, ENROLL_VERSION, ENROLL_MONTH, COHORT, 
                               TREATMENT_GROUP, COUNTRY, PLANNED_ENROLLMENTS
    """
    if enroll_version is None:
        # Get latest enrollment version
        query = f"""
            SELECT DISTINCT ENROLL_VERSION 
            FROM PLANNED_ENROLLMENTS 
            WHERE TRIAL_SEQ = {trial_seq}
            ORDER BY ENROLL_VERSION DESC
            LIMIT 1
        """
        result = execute_query(query)
        if len(result) == 0:
            raise ValueError(f"No enrollment data found for trial_seq={trial_seq}")
        enroll_version = result.iloc[0, 0]
    
    query = f"""
        SELECT 
            TRIAL_SEQ, ENROLL_VERSION, ENROLL_MONTH, COHORT, 
            TREATMENT_GROUP, COUNTRY, PLANNED_ENROLLMENTS
        FROM PLANNED_ENROLLMENTS
        WHERE TRIAL_SEQ = {trial_seq} 
        AND ENROLL_VERSION = {enroll_version}
        ORDER BY ENROLL_MONTH, COUNTRY, COHORT, TREATMENT_GROUP
    """
    return execute_query(query)


def get_trial_dosing_intervals(trial_seq: int, dosage_version: int = None) -> pd.DataFrame:
    """
    Load dosing intervals for a specific trial.
    
    Args:
        trial_seq: Trial sequence number
        dosage_version: Dosage version (if None, uses latest)
    
    Returns:
        DataFrame with columns: TRIAL_SEQ, DOSAGE_VERSION, ITEM_SEQ, COHORT,
                               TREATMENT_GROUP, MONTH_NUMBER, QTY, OVERAGE
    """
    if dosage_version is None:
        # Get latest dosage version
        query = f"""
            SELECT DISTINCT DOSAGE_VERSION 
            FROM TRIAL_DOSING_INTERVALS 
            WHERE TRIAL_SEQ = {trial_seq}
            ORDER BY DOSAGE_VERSION DESC
            LIMIT 1
        """
        result = execute_query(query)
        if len(result) == 0:
            raise ValueError(f"No dosing intervals found for trial_seq={trial_seq}")
        dosage_version = result.iloc[0, 0]
    
    query = f"""
        SELECT 
            TRIAL_SEQ, DOSAGE_VERSION, ITEM_SEQ, COHORT, 
            TREATMENT_GROUP, MONTH_NUMBER, QTY, OVERAGE
        FROM TRIAL_DOSING_INTERVALS
        WHERE TRIAL_SEQ = {trial_seq}
        AND DOSAGE_VERSION = {dosage_version}
        ORDER BY ITEM_SEQ, COHORT, TREATMENT_GROUP, MONTH_NUMBER
    """
    return execute_query(query)


def get_trial_countries(trial_seq: int) -> pd.DataFrame:
    """
    Load trial country and region information.
    
    Args:
        trial_seq: Trial sequence number
    
    Returns:
        DataFrame with columns: TRIAL_SEQ, COUNTRY, REGION_SEQ, DEPOT
    """
    query = f"""
        SELECT TRIAL_SEQ, COUNTRY, REGION_SEQ, DEPOT
        FROM TRIAL_COUNTRIES
        WHERE TRIAL_SEQ = {trial_seq}
        ORDER BY COUNTRY
    """
    return execute_query(query)


def get_trial_items(trial_seq: int) -> pd.DataFrame:
    """
    Load item information for a specific trial.
    
    Args:
        trial_seq: Trial sequence number
    
    Returns:
        DataFrame with columns: ITEM_SEQ, ITEM_ID, TRIAL_SEQ
    """
    query = f"""
        SELECT ITEM_SEQ, ITEM_ID, TRIAL_SEQ
        FROM ITEMS
        WHERE TRIAL_SEQ = {trial_seq}
        ORDER BY ITEM_SEQ
    """
    return execute_query(query)


def compute_baseline_demand(
    trial_seq: int, 
    enroll_version: int = None, 
    dosage_version: int = None,
    verbose: bool = True
) -> pd.DataFrame:
    """
    Compute baseline demand by joining enrollments with dosing intervals.
    
    Algorithm:
    1. Load enrollment data (by month, cohort, treatment, country)
    2. Load dosing intervals (qty and overage by month of treatment)
    3. Join enrollments with dosing intervals
    4. Calculate consumption month: enrollment_month + interval_month_number
    5. Calculate demand_qty: planned_enrollments × qty × (1 + overage)
    6. Round up to whole units
    7. Aggregate by month, country, and item
    
    Args:
        trial_seq: Trial sequence number
        enroll_version: Enrollment version (if None, uses latest)
        dosage_version: Dosage version (if None, uses latest)
        verbose: Print progress information
    
    Returns:
        DataFrame with columns: CONSUMPTION_MONTH, COUNTRY, ITEM_SEQ, ITEM_ID, 
                               DEMAND_QTY, PATIENT_COUNT, BASE_QTY_PER_PATIENT
    """
    
    if verbose:
        print(f"\n{'='*80}")
        print(f"COMPUTING BASELINE DEMAND FOR TRIAL_SEQ={trial_seq}")
        print(f"{'='*80}")
    
    # Step 1: Load all required data
    if verbose:
        print(f"\n1. Loading data from Snowflake...")
    
    enrollments = get_trial_enrollments(trial_seq, enroll_version)
    dosing = get_trial_dosing_intervals(trial_seq, dosage_version)
    countries = get_trial_countries(trial_seq)
    items = get_trial_items(trial_seq)
    
    if verbose:
        print(f"   ✓ Enrollments loaded: {len(enrollments)} rows")
        print(f"   ✓ Dosing intervals loaded: {len(dosing)} rows")
        print(f"   ✓ Countries loaded: {len(countries)} rows")
        print(f"   ✓ Items loaded: {len(items)} rows")
    
    # Step 2: Validate data integrity
    if verbose:
        print(f"\n2. Validating data integrity...")
    
    # Check for missing keys
    enroll_missing = enrollments[['COHORT', 'TREATMENT_GROUP']].isnull().any().any()
    dosing_missing = dosing[['COHORT', 'TREATMENT_GROUP', 'ITEM_SEQ']].isnull().any().any()
    
    if enroll_missing or dosing_missing:
        raise ValueError("Missing join keys detected in enrollment or dosing data")
    
    if verbose:
        print(f"   ✓ No missing join keys")
        print(f"   ✓ Total patients in enrollments: {enrollments['PLANNED_ENROLLMENTS'].sum():,.0f}")
    
    # Step 3: Join enrollments with dosing intervals
    if verbose:
        print(f"\n3. Joining enrollments with dosing intervals...")
    
    # Prepare join keys (convert to appropriate types if needed)
    enrollments['JOIN_KEY'] = (
        enrollments['COHORT'].astype(str) + '_' + 
        enrollments['TREATMENT_GROUP'].astype(str)
    )
    dosing['JOIN_KEY'] = (
        dosing['COHORT'].astype(str) + '_' + 
        dosing['TREATMENT_GROUP'].astype(str)
    )
    
    # Join enrollment with dosing intervals
    merged = enrollments.merge(
        dosing[['ITEM_SEQ', 'MONTH_NUMBER', 'QTY', 'OVERAGE', 'JOIN_KEY']],
        on='JOIN_KEY',
        how='inner'
    )
    
    if verbose:
        print(f"   ✓ Merged data: {len(merged)} rows")
    
    # Step 4: Calculate consumption month
    if verbose:
        print(f"\n4. Calculating consumption months and demand...")
    
    merged['CONSUMPTION_MONTH'] = merged['ENROLL_MONTH'] + merged['MONTH_NUMBER']
    
    # Step 5: Calculate demand quantity with overage
    # Formula: demand_qty = planned_enrollments × qty × (1 + overage)
    merged['DEMAND_QTY_CALCULATED'] = (
        merged['PLANNED_ENROLLMENTS'] * 
        merged['QTY'] * 
        (1 + merged['OVERAGE'])
    )
    
    # Round up to whole units (ceiling)
    merged['DEMAND_QTY'] = np.ceil(merged['DEMAND_QTY_CALCULATED'])
    
    # Step 6: Join with items to get item IDs
    merged = merged.merge(
        items[['ITEM_SEQ', 'ITEM_ID']],
        on='ITEM_SEQ',
        how='left'
    )
    
    # Step 7: Aggregate by month, country, and item
    if verbose:
        print(f"   ✓ Aggregating demand by month, country, and item...")
    
    baseline_demand = merged.groupby(
        ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID']
    ).agg({
        'DEMAND_QTY': 'sum',
        'PLANNED_ENROLLMENTS': 'sum',
        'QTY': 'mean'  # Average base quantity per patient
    }).reset_index()
    
    baseline_demand.columns = [
        'CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID',
        'DEMAND_QTY', 'PATIENT_COUNT', 'BASE_QTY_PER_PATIENT'
    ]
    
    # Convert to integers where appropriate
    baseline_demand['CONSUMPTION_MONTH'] = baseline_demand['CONSUMPTION_MONTH'].astype(int)
    baseline_demand['ITEM_SEQ'] = baseline_demand['ITEM_SEQ'].astype(int)
    baseline_demand['DEMAND_QTY'] = baseline_demand['DEMAND_QTY'].astype(int)
    baseline_demand['PATIENT_COUNT'] = baseline_demand['PATIENT_COUNT'].astype(int)
    
    # Sort by month, country, item
    baseline_demand = baseline_demand.sort_values(
        ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ']
    ).reset_index(drop=True)
    
    # Step 8: Validation checks
    if verbose:
        print(f"\n5. Validation Summary:")
        print(f"   ✓ Total demand records: {len(baseline_demand)}")
        print(f"   ✓ Total demand quantity: {baseline_demand['DEMAND_QTY'].sum():,.0f} units")
        print(f"   ✓ Total patients: {baseline_demand['PATIENT_COUNT'].sum():,.0f}")
        print(f"   ✓ Consumption months range: {baseline_demand['CONSUMPTION_MONTH'].min()} - {baseline_demand['CONSUMPTION_MONTH'].max()}")
        print(f"   ✓ Countries: {baseline_demand['COUNTRY'].nunique()}")
        print(f"   ✓ Items: {baseline_demand['ITEM_ID'].nunique()}")
        
        # Spot check calculation
        sample = merged.iloc[0]
        calc_check = sample['PLANNED_ENROLLMENTS'] * sample['QTY'] * (1 + sample['OVERAGE'])
        print(f"\n6. Spot Check (First Enrollment Record):")
        print(f"   - Enrollments: {sample['PLANNED_ENROLLMENTS']}")
        print(f"   - Base Qty: {sample['QTY']}")
        print(f"   - Overage: {sample['OVERAGE']}")
        print(f"   - Calculated Demand: {sample['PLANNED_ENROLLMENTS']} × {sample['QTY']} × (1 + {sample['OVERAGE']}) = {calc_check:.2f}")
        print(f"   - Rounded Demand: {np.ceil(calc_check)}")
        
        print(f"\n{'='*80}\n")
    
    return baseline_demand


def get_baseline_demand_summary(baseline_demand: pd.DataFrame) -> dict:
    """
    Generate summary statistics for baseline demand.
    
    Args:
        baseline_demand: DataFrame from compute_baseline_demand()
    
    Returns:
        Dictionary with summary statistics by country, item, and month
    """
    summary = {
        'total_demand': baseline_demand['DEMAND_QTY'].sum(),
        'total_patients': baseline_demand['PATIENT_COUNT'].sum(),
        'by_country': baseline_demand.groupby('COUNTRY')['DEMAND_QTY'].sum().to_dict(),
        'by_item': baseline_demand.groupby('ITEM_ID')['DEMAND_QTY'].sum().to_dict(),
        'by_month': baseline_demand.groupby('CONSUMPTION_MONTH')['DEMAND_QTY'].sum().to_dict(),
        'peak_month': baseline_demand.groupby('CONSUMPTION_MONTH')['DEMAND_QTY'].sum().idxmax(),
        'peak_demand': baseline_demand.groupby('CONSUMPTION_MONTH')['DEMAND_QTY'].sum().max(),
    }
    return summary
