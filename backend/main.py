import sys
import os
from pathlib import Path
import logging
import traceback
import pdb
import json

# Add backend directory to Python path for imports
sys.path.insert(0, str(Path(__file__).parent))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import pandas as pd
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Reduce verbosity of some noisy libraries
logging.getLogger("snowflake.connector").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

# Debug configuration
DEBUG_MODE = os.getenv('DEBUG_BACKEND', '').lower() == 'true'
if DEBUG_MODE:
    logger.warning(f"[DEBUG] BACKEND DEBUG MODE ENABLED")
    logger.warning(f"[DEBUG] Set DEBUG_BACKEND=false to disable debugging")

# Import from src modules
from src.data_loader import get_schema_info, load_table_data, execute_query
from src.demand_calculator import (
    compute_baseline_demand,
    get_baseline_demand_summary,
    get_trial_enrollments,
    get_trial_dosing_intervals,
    get_trial_items,
    get_trial_countries,
    format_month
)
from src.diagnostics import diagnose_snowflake
from src.connection import test_connection

# Initialize FastAPI app
app = FastAPI(
    title="Clinical Supply Forecast API",
    description="API for pharmaceutical supply chain demand forecasting",
    version="1.0.0"
)

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== PYDANTIC MODELS =====
class HealthCheckResponse(BaseModel):
    status: str
    message: str

class SchemaInfo(BaseModel):
    table_count: int
    tables: List[str]
    details: Optional[Dict[str, Any]] = None

class BaselineDemandRequest(BaseModel):
    trial_seq: int
    enroll_version: Optional[int] = None
    dosage_version: Optional[int] = None
    debug: Optional[bool] = False  # Enable detailed debugging output

class BaselineDemandResponse(BaseModel):
    trial_seq: int
    total_demand: int
    total_planned_subjects: int
    total_actual_subjects: int
    peak_month: str
    peak_demand: int
    by_country: Dict[str, int]
    by_item: Dict[str, int]
    by_month: Dict[str, int]
    detailed_records: Optional[List[Dict[str, Any]]] = None

class ScenarioRequest(BaseModel):
    trial_seq: int
    scenario_name: str
    affected_countries: List[str]
    reduction_factor: float
    start_month: int
    enroll_version: Optional[int] = None
    dosage_version: Optional[int] = None

class ScenarioResponse(BaseModel):
    scenario_name: str
    original_total: int
    scenario_total: int
    total_reduction: int
    reduction_percentage: float
    by_country: Dict[str, int]
    by_item: Dict[str, int]
    detailed_records: Optional[List[Dict[str, Any]]] = None

class ComparisonResponse(BaseModel):
    baseline_total: int
    scenario_total: int
    variance_total: int
    variance_percentage: float
    by_month_comparison: Dict[int, Dict[str, int]]
    by_country_comparison: Dict[str, Dict[str, int]]
    by_item_comparison: Dict[str, Dict[str, int]]

class EnrollmentVersionResponse(BaseModel):
    trial_seq: int
    versions: List[int]
    latest_version: int

class DosingVersionResponse(BaseModel):
    trial_seq: int
    versions: List[int]
    latest_version: int

class ProgramResponse(BaseModel):
    program_seq: int
    program_id: str
    program_name: Optional[str] = None
    status: Optional[str] = None
    trial_count: Optional[int] = None

class TrialResponse(BaseModel):
    trial_seq: int
    trial_id: str
    program_seq: int
    trial_name: Optional[str] = None
    description: Optional[str] = None

# ===== HEALTH & DIAGNOSTICS ENDPOINTS =====

@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Check API and Snowflake connection status"""
    try:
        test_connection()
        return HealthCheckResponse(
            status="healthy",
            message="API and Snowflake connection are operational"
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Connection failed: {str(e)}")

@app.get("/diagnostics")
async def get_diagnostics():
    """Get Snowflake environment diagnostics"""
    try:
        diagnose_snowflake()
        return {"status": "completed", "message": "See console output for diagnostics"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== SCHEMA EXPLORATION ENDPOINTS =====

@app.get("/schema", response_model=SchemaInfo)
async def get_schema(include_details: bool = False):
    """Get Snowflake schema information"""
    try:
        info = get_schema_info()
        
        response = SchemaInfo(
            table_count=info['table_count'],
            tables=list(info['table_details'].keys()) if info['table_details'] else []
        )
        
        if include_details:
            details = {}
            for table_name, table_info in info['table_details'].items():
                details[table_name] = {
                    'row_count': table_info['row_count'],
                    'columns': table_info['columns'].to_dict(orient='records')
                }
            response.details = details
        
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/trials")
async def get_trials():
    """Get list of available trials"""
    try:
        query = "SELECT DISTINCT TRIAL_SEQ, TRIAL_ID FROM TRIALS ORDER BY TRIAL_SEQ"
        df = execute_query(query)
        return df.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== PROGRAM & TRIAL SELECTION ENDPOINTS =====

@app.get("/programs", response_model=List[ProgramResponse])
async def get_programs():
    """
    Get list of active programs 
    Returns all programs in the PROGRAM table ordered by PROGRAM_SEQ.
    This is the landing page view for program selection.
    """
    try:
        logger.info(f"[PROGRAMS] Fetching programs...")
        # Query all programs from PROGRAM table, ordered by PROGRAM_SEQ
        # PROGRAM table contains: PROGRAM_SEQ, PROGRAM_ID
        query = """
            SELECT 
                P.PROGRAM_SEQ,
                P.PROGRAM_ID,
                COUNT(T.TRIAL_SEQ) as TRIAL_COUNT
            FROM PROGRAM P
            LEFT JOIN TRIALS T ON P.PROGRAM_SEQ = T.PROGRAM_SEQ
            GROUP BY P.PROGRAM_SEQ, P.PROGRAM_ID
            ORDER BY P.PROGRAM_SEQ
        """
        df = execute_query(query)
        logger.info(f"[PROGRAMS] Retrieved {len(df)} programs")
        
        # Convert to list of ProgramResponse objects
        programs = [
            ProgramResponse(
                program_seq=int(row['PROGRAM_SEQ']),
                program_id=str(row['PROGRAM_ID']),
                program_name=None,  # Not available in PROGRAM table
                status=None,  # Not available in PROGRAM table
                trial_count=int(row.get('TRIAL_COUNT', 0))
            )
            for _, row in df.iterrows()
        ]
        
        return programs
    except Exception as e:
        error_msg = f"Failed to get programs: {str(e)}"
        logger.error(f"[PROGRAMS] ERROR - {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/programs/{program_seq}/trials", response_model=List[TrialResponse])
async def get_trials_by_program(program_seq: int):
    """
    Get all trials for a specific program
    
    Parameters:
    - program_seq: The program sequence number
    
    Returns all trials belonging to the specified program, ordered by TRIAL_SEQ.
    This is the detailed view shown after program selection.
    """
    try:
        logger.info(f"[PROGRAMS] Fetching trials for program_seq={program_seq}...")
        
        # Query trials for the specific program
        # TRIALS table contains: TRIAL_SEQ, TRIAL_ID, PROGRAM_SEQ
        query = f"""
            SELECT 
                TRIAL_SEQ,
                TRIAL_ID,
                PROGRAM_SEQ
            FROM TRIALS
            WHERE PROGRAM_SEQ = {program_seq}
            ORDER BY TRIAL_SEQ
        """
        df = execute_query(query)
        logger.info(f"[PROGRAMS] Retrieved {len(df)} trials for program_seq={program_seq}")
        
        if len(df) == 0:
            logger.warning(f"[PROGRAMS] No trials found for program_seq={program_seq}")
        
        # Convert to list of TrialResponse objects
        trials = [
            TrialResponse(
                trial_seq=int(row['TRIAL_SEQ']),
                trial_id=str(row['TRIAL_ID']),
                program_seq=int(row['PROGRAM_SEQ']),
                trial_name=None,  # Not available in TRIALS table
                description=None  # Not available in TRIALS table
            )
            for _, row in df.iterrows()
        ]
        
        return trials
    except Exception as e:
        error_msg = f"Failed to get trials for program: {str(e)}"
        logger.error(f"[PROGRAMS] ERROR - {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/tables/{table_name}")
async def get_table_data(table_name: str, limit: int = 10):
    """Get sample data from a specific table"""
    try:
        df = load_table_data(table_name, limit=limit)
        return df.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== VERSION ENDPOINTS =====

@app.get("/trials/{trial_seq}/enrollment-versions", response_model=EnrollmentVersionResponse)
async def get_enrollment_versions(trial_seq: int):
    """
    Get all available enrollment versions for a trial
    Returns a list of version numbers and the latest version
    """
    try:
        logger.info(f"[VERSIONS] Fetching enrollment versions for trial_seq={trial_seq}...")
        query = f"""
            SELECT DISTINCT ENROLL_VERSION 
            FROM PLANNED_ENROLLMENTS 
            WHERE TRIAL_SEQ = {trial_seq}
            ORDER BY ENROLL_VERSION DESC
        """
        df = execute_query(query)
        
        if len(df) == 0:
            logger.warning(f"[VERSIONS] No enrollment versions found for trial_seq={trial_seq}")
            raise HTTPException(
                status_code=404,
                detail=f"No enrollment data found for trial_seq={trial_seq}"
            )
        
        versions = sorted(df['ENROLL_VERSION'].astype(int).tolist())
        latest_version = max(versions)
        
        logger.info(f"[VERSIONS] Found {len(versions)} enrollment versions: {versions}")
        
        return EnrollmentVersionResponse(
            trial_seq=trial_seq,
            versions=versions,
            latest_version=latest_version
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get enrollment versions: {str(e)}"
        logger.error(f"[VERSIONS] ERROR - {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/trials/{trial_seq}/dosing-versions", response_model=DosingVersionResponse)
async def get_dosing_versions(trial_seq: int):
    """
    Get all available dosing versions for a trial
    Returns a list of version numbers and the latest version
    """
    try:
        logger.info(f"[VERSIONS] Fetching dosing versions for trial_seq={trial_seq}...")
        query = f"""
            SELECT DISTINCT DOSAGE_VERSION 
            FROM TRIAL_DOSING_INTERVALS 
            WHERE TRIAL_SEQ = {trial_seq}
            ORDER BY DOSAGE_VERSION DESC
        """
        df = execute_query(query)
        
        if len(df) == 0:
            logger.warning(f"[VERSIONS] No dosing versions found for trial_seq={trial_seq}")
            raise HTTPException(
                status_code=404,
                detail=f"No dosing data found for trial_seq={trial_seq}"
            )
        
        versions = sorted(df['DOSAGE_VERSION'].astype(int).tolist())
        latest_version = max(versions)
        
        logger.info(f"[VERSIONS] Found {len(versions)} dosing versions: {versions}")
        
        return DosingVersionResponse(
            trial_seq=trial_seq,
            versions=versions,
            latest_version=latest_version
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get dosing versions: {str(e)}"
        logger.error(f"[VERSIONS] ERROR - {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

# ===== BASELINE DEMAND ENDPOINTS =====

@app.post("/baseline-demand", response_model=BaselineDemandResponse)
async def calculate_baseline_demand(request: BaselineDemandRequest, include_records: bool = False):
    """
    Calculate baseline demand for a trial
    
    Returns:
    - Summary statistics (total demand, peak month, etc.)
    - Breakdown by country, item, and month
    - Optional: detailed records
    
    Debug Mode:
    - Set debug=true in request body to enable detailed debugging
    - Shows DataFrame previews, join diagnostics, and breakpoints
    """
    try:
        debug = request.debug or DEBUG_MODE
        logger.info(f"[BASELINE-DEMAND] Request received: trial_seq={request.trial_seq}, enroll_version={request.enroll_version}, dosage_version={request.dosage_version}, include_records={include_records}, debug={debug}")
        
        if debug:
            logger.warning(f"[BASELINE-DEMAND] DEBUG MODE ENABLED - Detailed diagnostics active")
            logger.debug(f"[BASELINE-DEMAND] Full request: {request.model_dump()}")
        
        # Compute baseline demand
        logger.info(f"[BASELINE-DEMAND] Computing baseline demand...")
        baseline_demand = compute_baseline_demand(
            trial_seq=request.trial_seq,
            enroll_version=request.enroll_version,
            dosage_version=request.dosage_version,
            verbose=False
        )
        logger.info(f"[BASELINE-DEMAND] Baseline demand computed successfully. Shape: {baseline_demand.shape if hasattr(baseline_demand, 'shape') else 'unknown'}")
        
        if debug:
            logger.debug(f"[BASELINE-DEMAND] DataFrame dtypes:\n{baseline_demand.dtypes.to_string()}")
            logger.debug(f"[BASELINE-DEMAND] DataFrame nulls:\n{baseline_demand.isnull().sum().to_string()}")
        
        # Get summary
        logger.info(f"[BASELINE-DEMAND] Generating summary statistics...")
        summary = get_baseline_demand_summary(baseline_demand)
        logger.info(f"[BASELINE-DEMAND] Summary generated. Total demand: {summary.get('total_demand', 'N/A')}")
        
        if debug:
            logger.debug(f"[BASELINE-DEMAND] Summary details: {json.dumps(summary, indent=2, default=str)}")
        
        response = BaselineDemandResponse(
            trial_seq=request.trial_seq,
            total_demand=int(summary['total_demand']),
            total_planned_subjects=int(summary['total_planned_subjects']),
            total_actual_subjects=int(summary['total_actual_subjects']),
            peak_month=str(summary['peak_month']),
            peak_demand=int(summary['peak_demand']),
            by_country=summary['by_country'],
            by_item=summary['by_item'],
            by_month={
                (format_month(int(k)) if isinstance(k, (int, np.integer)) else str(k)): int(v)
                for k, v in summary['by_month'].items()
            }
        )
        
        if include_records:
            logger.info(f"[BASELINE-DEMAND] Including detailed records ({len(baseline_demand)} rows)...")
            response.detailed_records = baseline_demand.to_dict(orient='records')
        
        logger.info(f"[BASELINE-DEMAND] Response prepared successfully")
        return response
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[BASELINE-DEMAND] ERROR - {error_msg}")
        logger.error(f"[BASELINE-DEMAND] Traceback:\n{traceback.format_exc()}")
        if DEBUG_MODE:
            logger.error(f"[DEBUG] Stack trace available for debugging")
        raise HTTPException(status_code=500, detail=error_msg)

# ===== SCENARIO ANALYSIS ENDPOINTS =====

@app.post("/scenario", response_model=ScenarioResponse)
async def apply_scenario(request: ScenarioRequest, include_records: bool = False):
    """
    ============================================================================
    TASK 4: Scenario Modeling - Enrollment Adjustment & Demand Recomputation
    ============================================================================
    
    This endpoint implements the apply_scenario() and compute_scenario_demand()
    functions as specified in Task 4 (Scenario Modeling):
    
    1. apply_scenario():
       - Accepts: affected_countries, reduction_factor, start_month
       - Clones enrollment dataframe
       - Applies multiplicative reduction to affected countries from start month
       - Validates reduction assumptions
       - Provides before/after comparison
    
    2. compute_scenario_demand():
       - Uses modified enrollments
       - Reuses demand calculation logic
       - Returns same format as baseline demand
    
    Example Usage:
    {
        "trial_seq": 1,
        "scenario_name": "EU Region Slowdown",
        "affected_countries": ["Germany", "France", "Italy", "Spain", "UK"],
        "reduction_factor": 0.30,  # 30% reduction
        "start_month": 3
    }
    
    This applies a 30% enrollment reduction to 5 EU countries starting month 3.
    Unaffected regions remain unchanged, enabling variance analysis.
    ============================================================================
    """
    try:
        logger.info(f"\n{'='*80}")
        logger.info(f"[SCENARIO] Starting scenario modeling")
        logger.info(f"[SCENARIO] Trial: {request.trial_seq}, Scenario: {request.scenario_name}")
        logger.info(f"[SCENARIO] Affected countries: {request.affected_countries}")
        logger.info(f"[SCENARIO] Reduction factor: {request.reduction_factor * 100:.1f}% from month {request.start_month}")
        
        from src.demand_calculator import (
            get_trial_enrollments,
            get_trial_dosing_intervals,
            get_trial_items
        )
        
        # ===== STEP 1: apply_scenario() - Load Original Enrollments =====
        logger.info(f"[SCENARIO:Step1] Loading baseline enrollments for trial {request.trial_seq}")
        enrollments = get_trial_enrollments(request.trial_seq, request.enroll_version)
        logger.info(f"[SCENARIO:Step1] Loaded {len(enrollments)} enrollment records")
        logger.info(f"[SCENARIO:Step1] Columns: {list(enrollments.columns)}")
        
        # Calculate baseline totals
        original_total = enrollments['PLANNED_ENROLLMENTS'].sum()
        original_by_country = enrollments.groupby('COUNTRY')['PLANNED_ENROLLMENTS'].sum().to_dict()
        logger.info(f"[SCENARIO:Step1] Original total enrollments: {int(original_total)}")
        logger.info(f"[SCENARIO:Step1] Enrollment distribution: {original_by_country}")
        
        # ===== STEP 2: apply_scenario() - Clone & Apply Multiplicative Reduction =====
        logger.info(f"[SCENARIO:Step2] Applying scenario modifications")
        
        # CRITICAL: Clone the dataframe to preserve original data
        scenario_enrollments = enrollments.copy()
        logger.info(f"[SCENARIO:Step2] Created scenario enrollment copy (deep copy)")
        
        # Create mask for affected countries and months
        mask = (scenario_enrollments['COUNTRY'].isin(request.affected_countries)) & \
               (scenario_enrollments['ENROLL_MONTH'] >= request.start_month)
        
        affected_rows = mask.sum()
        affected_enrollments = enrollments[mask]['PLANNED_ENROLLMENTS'].sum()
        logger.info(f"[SCENARIO:Step2] Mask criteria: countries IN {request.affected_countries} AND month >= {request.start_month}")
        logger.info(f"[SCENARIO:Step2] Affected rows: {affected_rows} out of {len(scenario_enrollments)}")
        logger.info(f"[SCENARIO:Step2] Affected enrollments: {int(affected_enrollments)} out of {int(original_total)}")
        
        # Apply multiplicative reduction: new_value = original * (1 - reduction_factor)
        unaffected_before = scenario_enrollments[~mask]['PLANNED_ENROLLMENTS'].sum()
        logger.info(f"[SCENARIO:Step2] Unaffected enrollments: {int(unaffected_before)} (should remain unchanged)")
        
        scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] = (
            scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] * 
            (1 - request.reduction_factor)
        ).round().astype(int)
        
        unaffected_after = scenario_enrollments[~mask]['PLANNED_ENROLLMENTS'].sum()
        scenario_total = scenario_enrollments['PLANNED_ENROLLMENTS'].sum()
        actual_reduction = int(original_total - scenario_total)
        
        logger.info(f"[SCENARIO:Step2] Applied multiplicative reduction: value × (1 - {request.reduction_factor})")
        logger.info(f"[SCENARIO:Step2] Unaffected unchanged: {int(unaffected_before)} → {int(unaffected_after)}")
        logger.info(f"[SCENARIO:Step2] Total reduction: {actual_reduction} enrollments")
        logger.info(f"[SCENARIO:Step2] Scenario total: {int(scenario_total)} (original: {int(original_total)})")
        
        # ===== STEP 3: apply_scenario() - Validate Reduction Assumptions =====
        logger.info(f"[SCENARIO:Step3] Validating reduction assumptions")
        
        # Validation 1: Unaffected regions should remain unchanged
        unaffected_changed = unaffected_before - unaffected_after
        if unaffected_changed != 0:
            logger.error(f"[SCENARIO:Step3] VALIDATION FAILED: Unaffected regions changed by {unaffected_changed}")
            raise ValueError(f"Unaffected regions enrollment changed by {unaffected_changed} (expected 0)")
        logger.info(f"[SCENARIO:Step3] ✓ Unaffected regions unchanged (validation passed)")
        
        # Validation 2: Total reduction should be <= affected enrollments
        if actual_reduction > affected_enrollments:
            logger.error(f"[SCENARIO:Step3] VALIDATION FAILED: Reduction {actual_reduction} > affected {affected_enrollments}")
            raise ValueError(f"Total reduction {actual_reduction} exceeds affected rows {affected_enrollments}")
        logger.info(f"[SCENARIO:Step3] ✓ Total reduction within bounds (validation passed)")
        
        # Validation 3: Reduction percentage check
        expected_reduction = affected_enrollments * request.reduction_factor
        reduction_diff = abs(actual_reduction - expected_reduction)
        if reduction_diff > 1:  # Small tolerance for rounding
            logger.warning(f"[SCENARIO:Step3] Reduction difference: {reduction_diff:.2f} (expected ~0, may be rounding)")
        logger.info(f"[SCENARIO:Step3] ✓ Reduction percentage valid (validation passed)")
        
        scenario_by_country = scenario_enrollments.groupby('COUNTRY')['PLANNED_ENROLLMENTS'].sum().to_dict()
        logger.info(f"[SCENARIO:Step3] Scenario enrollment distribution: {scenario_by_country}")
        
        # ===== STEP 4: compute_scenario_demand() - Load Supporting Data =====
        logger.info(f"[SCENARIO:Step4] Loading dosing intervals and items")
        
        dosing = get_trial_dosing_intervals(request.trial_seq, request.dosage_version)
        logger.info(f"[SCENARIO:Step4] Loaded {len(dosing)} dosing interval records")
        
        items = execute_query(f"SELECT ITEM_SEQ, ITEM_ID FROM ITEMS WHERE TRIAL_SEQ = {request.trial_seq}")
        logger.info(f"[SCENARIO:Step4] Loaded {len(items)} item records")
        
        # ===== STEP 5: compute_scenario_demand() - Reuse Calculation Logic =====
        logger.info(f"[SCENARIO:Step5] Computing scenario demand with modified enrollments")
        
        # Prepare join keys (cohort_treatment_group identifier)
        scenario_enrollments['JOIN_KEY'] = (
            scenario_enrollments['COHORT'].astype(str) + '_' + 
            scenario_enrollments['TREATMENT_GROUP'].astype(str)
        )
        dosing['JOIN_KEY'] = (
            dosing['COHORT'].astype(str) + '_' + 
            dosing['TREATMENT_GROUP'].astype(str)
        )
        
        # Merge enrollments with dosing intervals
        logger.info(f"[SCENARIO:Step5] Joining scenario enrollments with dosing intervals on JOIN_KEY")
        merged = scenario_enrollments.merge(
            dosing[['ITEM_SEQ', 'MONTH_NUMBER', 'QTY', 'OVERAGE', 'JOIN_KEY']],
            on='JOIN_KEY',
            how='inner'
        )
        logger.info(f"[SCENARIO:Step5] Merge result: {len(merged)} rows")
        
        if len(merged) == 0:
            logger.error(f"[SCENARIO:Step5] Merge resulted in 0 rows - no matching join keys")
            raise ValueError("No matching data after joining enrollments with dosing intervals")
        
        # Calculate consumption month and demand quantity
        merged['CONSUMPTION_MONTH'] = merged['ENROLL_MONTH'] + merged['MONTH_NUMBER']
        merged['DEMAND_QTY_CALCULATED'] = (
            merged['PLANNED_ENROLLMENTS'] * 
            merged['QTY'] * 
            (1 + merged['OVERAGE'])
        )
        merged['DEMAND_QTY'] = np.ceil(merged['DEMAND_QTY_CALCULATED']).astype(int)
        logger.info(f"[SCENARIO:Step5] Calculated demand for {len(merged)} combinations")
        
        # Join with item descriptions
        merged = merged.merge(items[['ITEM_SEQ', 'ITEM_ID']], on='ITEM_SEQ', how='left')
        logger.info(f"[SCENARIO:Step5] Joined with item descriptions: {len(merged)} rows")
        
        # Aggregate by consumption month, country, and item
        logger.info(f"[SCENARIO:Step5] Aggregating demand by month, country, and item")
        scenario_demand = merged.groupby(
            ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID']
        ).agg({
            'DEMAND_QTY': 'sum',
            'PLANNED_ENROLLMENTS': 'sum'
        }).reset_index()
        
        scenario_demand.columns = ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID', 'DEMAND_QTY', 'PATIENT_COUNT']
        
        # Ensure type safety for numeric fields
        scenario_demand['DEMAND_QTY'] = scenario_demand['DEMAND_QTY'].astype(int)
        scenario_demand['PATIENT_COUNT'] = scenario_demand['PATIENT_COUNT'].astype(int)
        scenario_demand['CONSUMPTION_MONTH'] = scenario_demand['CONSUMPTION_MONTH'].astype(int)
        
        logger.info(f"[SCENARIO:Step5] Aggregation complete: {len(scenario_demand)} records")
        logger.info(f"[SCENARIO:Step5] Demand columns: {list(scenario_demand.columns)}")
        
        # ===== STEP 6: Prepare Response with Before/After Comparison =====
        logger.info(f"[SCENARIO:Step6] Building response with before/after comparison")
        
        # Build aggregations for response
        by_country = {}
        for country in scenario_demand['COUNTRY'].unique():
            total = int(scenario_demand[scenario_demand['COUNTRY'] == country]['DEMAND_QTY'].sum())
            by_country[str(country)] = total
        
        by_item = {}
        for item in scenario_demand['ITEM_ID'].unique():
            total = int(scenario_demand[scenario_demand['ITEM_ID'] == item]['DEMAND_QTY'].sum())
            by_item[str(item)] = total
        
        logger.info(f"[SCENARIO:Step6] Demand by country: {by_country}")
        logger.info(f"[SCENARIO:Step6] Demand by item: {by_item}")
        
        # Calculate scenario totals and reduction
        scenario_demand_total = scenario_demand['DEMAND_QTY'].sum()
        baseline_demand_total = original_total  # Enrollment-based baseline for comparison
        total_reduction = int(baseline_demand_total - scenario_demand_total)
        reduction_percentage = float(
            (baseline_demand_total - scenario_demand_total) / baseline_demand_total * 100
        ) if baseline_demand_total > 0 else 0.0
        
        logger.info(f"[SCENARIO:Step6] Baseline demand total: {int(baseline_demand_total)}")
        logger.info(f"[SCENARIO:Step6] Scenario demand total: {int(scenario_demand_total)}")
        logger.info(f"[SCENARIO:Step6] Total reduction: {total_reduction} ({reduction_percentage:.2f}%)")
        
        # Create response object
        response = ScenarioResponse(
            scenario_name=request.scenario_name,
            original_total=int(baseline_demand_total),
            scenario_total=int(scenario_demand_total),
            total_reduction=total_reduction,
            reduction_percentage=reduction_percentage,
            by_country=by_country,
            by_item=by_item
        )
        
        if include_records:
            response.detailed_records = scenario_demand.to_dict(orient='records')
            logger.info(f"[SCENARIO:Step6] Included {len(response.detailed_records)} detailed records in response")
        
        logger.info(f"[SCENARIO] Scenario modeling complete - SUCCESS")
        logger.info(f"{'='*80}\n")
        
        return response
        
    except Exception as e:
        logger.error(f"[SCENARIO] ERROR: {type(e).__name__}: {str(e)}")
        logger.error(f"[SCENARIO] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}"
        )

# ===== COMPARISON ENDPOINTS =====

@app.post("/compare-scenario")
async def compare_scenario(baseline_request: BaselineDemandRequest, scenario_request: ScenarioRequest):
    """
    Compare baseline demand with scenario demand
    
    Returns variance analysis by month, country, and item
    """
    try:
        # Get baseline
        baseline_df = compute_baseline_demand(
            trial_seq=baseline_request.trial_seq,
            enroll_version=baseline_request.enroll_version,
            dosage_version=baseline_request.dosage_version,
            verbose=False
        )
        
        # Get scenario (recompute using scenario logic)
        enrollments = get_trial_enrollments(scenario_request.trial_seq, scenario_request.enroll_version)
        scenario_enrollments = enrollments.copy()
        mask = (scenario_enrollments['COUNTRY'].isin(scenario_request.affected_countries)) & \
               (scenario_enrollments['ENROLL_MONTH'] >= scenario_request.start_month)
        
        scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] = (
            scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] * 
            (1 - scenario_request.reduction_factor)
        ).round().astype(int)
        
        dosing = get_trial_dosing_intervals(scenario_request.trial_seq, scenario_request.dosage_version)
        items = execute_query(f"SELECT ITEM_SEQ, ITEM_ID FROM ITEMS WHERE TRIAL_SEQ = {scenario_request.trial_seq}")
        
        scenario_enrollments['JOIN_KEY'] = (
            scenario_enrollments['COHORT'].astype(str) + '_' + 
            scenario_enrollments['TREATMENT_GROUP'].astype(str)
        )
        dosing['JOIN_KEY'] = (
            dosing['COHORT'].astype(str) + '_' + 
            dosing['TREATMENT_GROUP'].astype(str)
        )
        
        merged = scenario_enrollments.merge(
            dosing[['ITEM_SEQ', 'MONTH_NUMBER', 'QTY', 'OVERAGE', 'JOIN_KEY']],
            on='JOIN_KEY',
            how='inner'
        )
        
        merged['CONSUMPTION_MONTH'] = merged['ENROLL_MONTH'] + merged['MONTH_NUMBER']
        merged['DEMAND_QTY'] = np.ceil(
            merged['PLANNED_ENROLLMENTS'] * merged['QTY'] * (1 + merged['OVERAGE'])
        )
        
        merged = merged.merge(items[['ITEM_SEQ', 'ITEM_ID']], on='ITEM_SEQ', how='left')
        
        scenario_df = merged.groupby(
            ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID']
        ).agg({'DEMAND_QTY': 'sum'}).reset_index()
        scenario_df.columns = ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID', 'DEMAND_QTY']
        
        # Compare
        comparison = baseline_df.merge(
            scenario_df,
            on=['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID'],
            how='outer',
            suffixes=('_baseline', '_scenario')
        ).fillna(0)
        
        comparison['VARIANCE'] = comparison['DEMAND_QTY_scenario'] - comparison['DEMAND_QTY_baseline']
        comparison['VARIANCE_PCT'] = (comparison['VARIANCE'] / comparison['DEMAND_QTY_baseline'] * 100).replace([np.inf, -np.inf], 0).fillna(0)
        
        # Build response
        response = {
            'baseline_total': int(baseline_df['DEMAND_QTY'].sum()),
            'scenario_total': int(scenario_df['DEMAND_QTY'].sum()),
            'variance_total': int(comparison['VARIANCE'].sum()),
            'variance_percentage': float(comparison['VARIANCE'].sum() / baseline_df['DEMAND_QTY'].sum() * 100),
            'by_month_comparison': {},
            'by_country_comparison': {},
            'by_item_comparison': {}
        }
        
        # Month comparison
        for month in comparison['CONSUMPTION_MONTH'].unique():
            month_data = comparison[comparison['CONSUMPTION_MONTH'] == month]
            response['by_month_comparison'][int(month)] = {
                'baseline': int(month_data[month_data['ITEM_ID'].notna()]['DEMAND_QTY_baseline'].sum()),
                'scenario': int(month_data[month_data['ITEM_ID'].notna()]['DEMAND_QTY_scenario'].sum()),
                'variance': int(month_data['VARIANCE'].sum())
            }
        
        # Country comparison
        for country in baseline_df['COUNTRY'].unique():
            baseline_country = baseline_df[baseline_df['COUNTRY'] == country]['DEMAND_QTY'].sum()
            scenario_country = scenario_df[scenario_df['COUNTRY'] == country]['DEMAND_QTY'].sum()
            response['by_country_comparison'][country] = {
                'baseline': int(baseline_country),
                'scenario': int(scenario_country),
                'variance': int(scenario_country - baseline_country)
            }
        
        # Item comparison
        for item in baseline_df['ITEM_ID'].unique():
            baseline_item = baseline_df[baseline_df['ITEM_ID'] == item]['DEMAND_QTY'].sum()
            scenario_item = scenario_df[scenario_df['ITEM_ID'] == item]['DEMAND_QTY'].sum()
            response['by_item_comparison'][item] = {
                'baseline': int(baseline_item),
                'scenario': int(scenario_item),
                'variance': int(scenario_item - baseline_item)
            }
        
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ===== ROOT ENDPOINT =====

@app.get("/")
async def root():
    """Root endpoint with API documentation links"""
    return {
        "message": "Clinical Supply Forecast API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "schema": "/schema",
            "trials": "/trials",
            "baseline_demand": "POST /baseline-demand",
            "scenario": "POST /scenario",
            "compare": "POST /compare-scenario"
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
