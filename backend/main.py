import sys
from pathlib import Path
import logging
import traceback

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logging.getLogger("snowflake.connector").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


from src.data_loader import get_schema_info, load_table_data, execute_query
from src.demand_calculator import (
    compute_baseline_demand,
    get_baseline_demand_summary,
    get_trial_enrollments,
    get_trial_dosing_intervals,
    get_trial_items,
    get_trial_countries
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

# == PYDANTIC MODELS ==
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

class BaselineDemandResponse(BaseModel):
    trial_seq: int
    total_demand: int
    total_patients: int
    peak_month: int
    peak_demand: int
    by_country: Dict[str, int]
    by_item: Dict[str, int]
    by_month: Dict[int, int]
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

# == API HEALTH & SNOWFLAKE DIAGNOSTICS ENDPOINTS ==

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

# == SCHEMA EXPLORATION ENDPOINTS ==

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

@app.get("/tables/{table_name}")
async def get_table_data(table_name: str, limit: int = 10):
    """Get sample data from a specific table"""
    try:
        df = load_table_data(table_name, limit=limit)
        return df.to_dict(orient='records')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# == BASELINE DEMAND ENDPOINTS ==

@app.post("/baseline-demand", response_model=BaselineDemandResponse)
async def calculate_baseline_demand(request: BaselineDemandRequest, include_records: bool = False):
    """
    Calculate baseline demand for a trial
    
    Returns:
    - Summary statistics (total demand, peak month, etc.)
    - Breakdown by country, item, and month
    - Optional: detailed records
    """
    try:
        logger.info(f"[BASELINE-DEMAND] Request received: trial_seq={request.trial_seq}, enroll_version={request.enroll_version}, dosage_version={request.dosage_version}, include_records={include_records}")

        # Compute baseline demand
        logger.info(f"[BASELINE-DEMAND] Computing baseline demand...")
        baseline_demand = compute_baseline_demand(
            trial_seq=request.trial_seq,
            enroll_version=request.enroll_version,
            dosage_version=request.dosage_version,
            verbose=False
        )
        logger.info(f"[BASELINE-DEMAND] Baseline demand computed successfully. Shape: {baseline_demand.shape if hasattr(baseline_demand, 'shape') else 'unknown'}")
        
        # Get summary
        logger.info(f"[BASELINE-DEMAND] Generating summary statistics...")
        summary = get_baseline_demand_summary(baseline_demand)
        logger.info(f"[BASELINE-DEMAND] Summary generated. Total demand: {summary.get('total_demand', 'N/A')}")
        
        response = BaselineDemandResponse(
            trial_seq=request.trial_seq,
            total_demand=int(summary['total_demand']),
            total_patients=int(summary['total_patients']),
            peak_month=int(summary['peak_month']),
            peak_demand=int(summary['peak_demand']),
            by_country=summary['by_country'],
            by_item=summary['by_item'],
            by_month={int(k): int(v) for k, v in summary['by_month'].items()}
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
        raise HTTPException(status_code=500, detail=error_msg)



# == ROOT ENDPOINT ==

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
    uvicorn.run(app, host="0.0.0.0", port=8085)
