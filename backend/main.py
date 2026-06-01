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
    program_seq: int
    scenario_name: str
    affected_countries: List[str]
    reduction_factor: float
    start_month: int
    enroll_version: Optional[int] = None
    dosage_version: Optional[int] = None

class CompareScenarioRequest(BaseModel):
    """Wrapper for comparing baseline and scenario demands"""
    baseline_request: BaselineDemandRequest
    scenario_request: ScenarioRequest

class ScenarioResponse(BaseModel):
    scenario_name: str
    detailed_records: Optional[List[Dict[str, Any]]] = None
    # Patient metrics
    baseline_patients: int
    scenario_patients: int
    patient_reduction: int
    patient_reduction_pct: float

    # Demand metrics
    baseline_demand: int
    scenario_demand: int
    demand_reduction: int
    demand_reduction_pct: float

    by_country: Dict[str, int]
    by_item: Dict[str, int]

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

class EnrollmentSummaryResponse(BaseModel):
    trial_seq: int
    enroll_version: Optional[int] = None
    enrollment_min: int
    enrollment_max: int
    total_planned: int
    total_actual: int
    countries: List[str]
    months: List[int]

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

@app.get("/trials/{trial_seq}/enrollment-summary", response_model=EnrollmentSummaryResponse)
async def get_enrollment_summary(trial_seq: int, enroll_version: Optional[int] = None):
    """
    Get enrollment summary for a trial
    Returns:
    - enrollment_min: minimum planned enrollments per month
    - enrollment_max: maximum planned enrollments per month
    - total_planned: total planned enrollments
    - total_actual: total actual subjects (from demand calculation)
    - countries: list of countries in the trial
    - months: list of enrollment months
    """
    try:
        logger.info(f"[ENROLLMENT-SUMMARY] Fetching enrollment summary for trial_seq={trial_seq}...")

        # Load enrollment data
        try:
            enrollments = get_trial_enrollments(trial_seq, enroll_version)
        except Exception as e:
            logger.warning(f"[ENROLLMENT-SUMMARY] DB unavailable, using mock data: {str(e)}")
            # Return mock data for development/testing
            return EnrollmentSummaryResponse(
                trial_seq=trial_seq,
                enroll_version=enroll_version,
                enrollment_min=10,
                enrollment_max=50,
                total_planned=500,
                total_actual=450,
                countries=["USA", "Germany", "Japan"],
                months=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
            )

        if len(enrollments) == 0:
            logger.warning(f"[ENROLLMENT-SUMMARY] No enrollment data found for trial_seq={trial_seq}")
            raise HTTPException(
                status_code=404,
                detail=f"No enrollment data found for trial_seq={trial_seq}"
            )

        # Calculate summary statistics
        enrollment_min = int(enrollments['PLANNED_ENROLLMENTS'].min())
        enrollment_max = int(enrollments['PLANNED_ENROLLMENTS'].max())
        total_planned = int(enrollments['PLANNED_ENROLLMENTS'].sum())

        # Get unique countries
        countries = sorted(enrollments['COUNTRY'].unique().tolist())

        # Get enrollment months
        months = sorted(enrollments['ENROLL_MONTH'].unique().tolist())

        # Get actual subjects from demand calculation (this is the "actual" enrollment)
        try:
            baseline_demand = compute_baseline_demand(
                trial_seq=trial_seq,
                enroll_version=enroll_version,
                verbose=False
            )
            total_actual = int(baseline_demand['ACTUAL_SUBJECTS'].sum()) if 'ACTUAL_SUBJECTS' in baseline_demand.columns else total_planned
        except Exception as e:
            logger.warning(f"[ENROLLMENT-SUMMARY] Could not compute actual subjects: {str(e)}")
            total_actual = total_planned

        # Get the version used
        version_used = int(enrollments['ENROLL_VERSION'].iloc[0]) if 'ENROLL_VERSION' in enrollments.columns else enroll_version

        logger.info(f"[ENROLLMENT-SUMMARY] Summary: min={enrollment_min}, max={enrollment_max}, total_planned={total_planned}, total_actual={total_actual}")

        return EnrollmentSummaryResponse(
            trial_seq=trial_seq,
            enroll_version=version_used,
            enrollment_min=enrollment_min,
            enrollment_max=enrollment_max,
            total_planned=total_planned,
            total_actual=total_actual,
            countries=countries,
            months=months
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Failed to get enrollment summary: {str(e)}"
        logger.error(f"[ENROLLMENT-SUMMARY] ERROR - {error_msg}")
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

# ============================================================
# HELPER: Demand computation (used for BOTH baseline + scenario)
# ============================================================
def _compute_demand(enrollments, dosing, items):
    df = enrollments.copy()

    # Join key
    df['JOIN_KEY'] = (
        df['COHORT'].astype(str) + '_' +
        df['TREATMENT_GROUP'].astype(str)
    )
    dosing['JOIN_KEY'] = (
        dosing['COHORT'].astype(str) + '_' +
        dosing['TREATMENT_GROUP'].astype(str)
    )

    merged = df.merge(
        dosing[['ITEM_SEQ', 'MONTH_NUMBER', 'QTY', 'OVERAGE', 'JOIN_KEY']],
        on='JOIN_KEY',
        how='inner'
    )

    if len(merged) == 0:
        raise ValueError("No matching data after joining enrollments with dosing intervals")

    # Consumption month
    merged['CONSUMPTION_MONTH'] = (
        merged['ENROLL_MONTH'] + merged['MONTH_NUMBER']
    )

    # Demand calculation
    merged['DEMAND_QTY'] = np.ceil(
        merged['PLANNED_ENROLLMENTS'] *
        merged['QTY'] *
        (1 + merged['OVERAGE'])
    ).astype(int)

    # Attach item IDs
    merged = merged.merge(
        items[['ITEM_SEQ', 'ITEM_ID']],
        on='ITEM_SEQ',
        how='left'
    )

    # Aggregate
    aggregated = merged.groupby(
        ['CONSUMPTION_MONTH', 'COUNTRY', 'ITEM_SEQ', 'ITEM_ID']
    ).agg({
        'DEMAND_QTY': 'sum',
        'PLANNED_ENROLLMENTS': 'sum'
    }).reset_index()

    aggregated.columns = [
        'CONSUMPTION_MONTH',
        'COUNTRY',
        'ITEM_SEQ',
        'ITEM_ID',
        'DEMAND_QTY',
        'PATIENT_COUNT'
    ]

    return aggregated


# ============================================================
# MAIN API
# ============================================================
@app.post("/scenario", response_model=ScenarioResponse)
async def apply_scenario(request: ScenarioRequest, include_records: bool = False):

    try:
        logger.info("=" * 80)
        logger.info("[SCENARIO] Starting scenario modeling")

        from src.demand_calculator import (
            get_trial_enrollments,
            get_trial_dosing_intervals
        )

        # ============================================================
        # STEP 1: Load enrollments
        # ============================================================
        enrollments = get_trial_enrollments(
            request.trial_seq,
            request.enroll_version
        )

        # Preserve baseline
        baseline_enrollments = enrollments.copy()

        # ============================================================
        # STEP 2: Apply scenario reduction
        # ============================================================
        scenario_enrollments = enrollments.copy()

        mask = (
            scenario_enrollments['COUNTRY'].isin(request.affected_countries)
        ) & (
            scenario_enrollments['ENROLL_MONTH'] >= request.start_month
        )

        scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] = (
            scenario_enrollments.loc[mask, 'PLANNED_ENROLLMENTS'] *
            (1 - request.reduction_factor)
        ).round().astype(int)

        # ============================================================
        # STEP 3: Validation
        # ============================================================
        unaffected_before = baseline_enrollments[~mask]['PLANNED_ENROLLMENTS'].sum()
        unaffected_after = scenario_enrollments[~mask]['PLANNED_ENROLLMENTS'].sum()

        if unaffected_before != unaffected_after:
            raise ValueError("Unaffected regions were modified")

        # ============================================================
        # STEP 4: Load dosing + items
        # ============================================================
        dosing = get_trial_dosing_intervals(
            request.trial_seq,
            request.dosage_version
        )

        items = execute_query(
            f"SELECT ITEM_SEQ, ITEM_ID FROM ITEMS WHERE TRIAL_SEQ = {request.trial_seq}"
        )

        # ============================================================
        # STEP 5: Compute demand (BASELINE + SCENARIO)
        # ============================================================
        baseline_demand = _compute_demand(baseline_enrollments, dosing, items)
        scenario_demand = _compute_demand(scenario_enrollments, dosing, items)

        # ============================================================
        # STEP 6: Metrics
        # ============================================================

        # -------- PATIENT METRICS --------
        baseline_patients = int(baseline_enrollments['PLANNED_ENROLLMENTS'].sum())
        scenario_patients = int(scenario_enrollments['PLANNED_ENROLLMENTS'].sum())

        patient_reduction = baseline_patients - scenario_patients
        patient_reduction_pct = (
            patient_reduction / baseline_patients * 100
        ) if baseline_patients > 0 else 0.0

        # -------- DEMAND METRICS --------
        baseline_demand_total = int(baseline_demand['DEMAND_QTY'].sum())
        scenario_demand_total = int(scenario_demand['DEMAND_QTY'].sum())

        demand_reduction = baseline_demand_total - scenario_demand_total
        demand_reduction_pct = (
            demand_reduction / baseline_demand_total * 100
        ) if baseline_demand_total > 0 else 0.0

        # ============================================================
        # STEP 7: Aggregations (SCENARIO ONLY)
        # ============================================================
        by_country = {
            str(country): int(
                scenario_demand[scenario_demand['COUNTRY'] == country]['DEMAND_QTY'].sum()
            )
            for country in scenario_demand['COUNTRY'].unique()
        }

        by_item = {
            str(item): int(
                scenario_demand[scenario_demand['ITEM_ID'] == item]['DEMAND_QTY'].sum()
            )
            for item in scenario_demand['ITEM_ID'].unique()
        }

        # ============================================================
        # STEP 8: FINAL RESPONSE (ONLY CORRECT FIELDS)
        # ============================================================
        response = ScenarioResponse(
            scenario_name=request.scenario_name,

            # Patient metrics
            baseline_patients=baseline_patients,
            scenario_patients=scenario_patients,
            patient_reduction=patient_reduction,
            patient_reduction_pct=patient_reduction_pct,

            # Demand metrics
            baseline_demand=baseline_demand_total,
            scenario_demand=scenario_demand_total,
            demand_reduction=demand_reduction,
            demand_reduction_pct=demand_reduction_pct,

            by_country=by_country,
            by_item=by_item
        )

        if include_records:
            response.detailed_records = scenario_demand.to_dict(orient='records')

        logger.info("[SCENARIO] SUCCESS")
        logger.info("=" * 80)

        return response

    except Exception as e:
        logger.error(f"[SCENARIO] ERROR: {type(e).__name__}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"{type(e).__name__}: {str(e)}"
        )

# ===== COMPARISON ENDPOINTS =====

@app.post("/compare-scenario")
async def compare_scenario(request: CompareScenarioRequest):
    """
    Compare baseline demand with scenario demand
    
    Returns variance analysis by month, country, and item
    """
    try:
        baseline_request = request.baseline_request
        scenario_request = request.scenario_request
        
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

        # Build comparison response
        response = {
            'summary': {
                'baseline_total': int(baseline_df['DEMAND_QTY'].sum()),
                'scenario_total': int(scenario_df['DEMAND_QTY'].sum()),
            },
            'by_month': {},
            'by_country': {},
            'by_item': {}
        }

        # By month
        for month in baseline_df['CONSUMPTION_MONTH'].unique():
            baseline_month = baseline_df[baseline_df['CONSUMPTION_MONTH'] == month]['DEMAND_QTY'].sum()
            scenario_month = scenario_df[scenario_df['CONSUMPTION_MONTH'] == month]['DEMAND_QTY'].sum()
            response['by_month'][int(month)] = {
                'baseline': int(baseline_month),
                'scenario': int(scenario_month),
                'variance': int(scenario_month - baseline_month)
            }

        # By country
        for country in baseline_df['COUNTRY'].unique():
            baseline_country = baseline_df[baseline_df['COUNTRY'] == country]['DEMAND_QTY'].sum()
            scenario_country = scenario_df[scenario_df['COUNTRY'] == country]['DEMAND_QTY'].sum()
            response['by_country'][country] = {
                'baseline': int(baseline_country),
                'scenario': int(scenario_country),
                'variance': int(scenario_country - baseline_country)
            }

        # By item
        for item in baseline_df['ITEM_ID'].unique():
            baseline_item = baseline_df[baseline_df['ITEM_ID'] == item]['DEMAND_QTY'].sum()
            scenario_item = scenario_df[scenario_df['ITEM_ID'] == item]['DEMAND_QTY'].sum()
            response['by_item'][item] = {
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
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8085,
        reload=False,
        workers=1,
        access_log=False
    )
