import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8085';
const API_TIMEOUT = import.meta.env.VITE_TIMEOUT || 3000000;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor
apiClient.interceptors.request.use(
  config => {
    console.log(`[API] ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  error => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  response => {
    console.log(`[API] Response: ${response.status}`, {
      status: response.statusText,
      dataSize: JSON.stringify(response.data).length + ' bytes'
    });
    return response;
  },
  error => {
    if (error.response) {
      console.error(`[API] ERROR ${error.response.status}:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        detail: error.response.data?.detail || error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      console.error('[API] ERROR: No response received', {
        request: error.request.method + ' ' + error.request.path,
        message: error.message
      });
    } else {
      console.error('[API] ERROR:', error.message);
    }
    return Promise.reject(error);
  }
);

// ===== HEALTH & DIAGNOSTICS =====

export const checkHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
};

export const getDiagnostics = async () => {
  try {
    const response = await apiClient.get('/diagnostics');
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get diagnostics: ${error.message}`);
  }
};

// ===== SCHEMA & METADATA =====

export const getSchema = async (includeDetails = false) => {
  try {
    const response = await apiClient.get('/schema', {
      params: { include_details: includeDetails }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get schema: ${error.message}`);
  }
};

export const getTrials = async () => {
  try {
    const response = await apiClient.get('/trials');
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get trials: ${error.message}`);
  }
};

// ===== PROGRAMS & PROGRAM-BASED TRIAL SELECTION =====

/**
 * Get all active programs
 * @returns {Promise<Array>} List of programs with trial counts
 */
export const getPrograms = async () => {
  try {
    console.log('[API:Programs] Fetching programs...');
    const response = await apiClient.get('/programs');
    console.log('[API:Programs] Retrieved programs:', {
      count: response.data.length,
      programs: response.data.map(p => ({ id: p.program_id, trials: p.trial_count }))
    });
    return response.data;
  } catch (error) {
    console.error('[API:Programs] Error fetching programs:', error.message);
    throw new Error(`Failed to get programs: ${error.message}`);
  }
};

/**
 * Get all trials for a specific program
 * @param {number} programSeq - The program sequence number
 * @returns {Promise<Array>} List of trials for the program
 */
export const getTrialsByProgram = async (programSeq) => {
  try {
    console.log(`[API:Programs] Fetching trials for program_seq=${programSeq}...`);
    const response = await apiClient.get(`/programs/${programSeq}/trials`);
    console.log(`[API:Programs] Retrieved ${response.data.length} trials for program_seq=${programSeq}`);
    return response.data;
  } catch (error) {
    console.error(`[API:Programs] Error fetching trials for program ${programSeq}:`, error.message);
    throw new Error(`Failed to get trials for program: ${error.message}`);
  }
};

export const getTableData = async (tableName, limit = 10) => {
  try {
    const response = await apiClient.get(`/tables/${tableName}`, {
      params: { limit }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get table data: ${error.message}`);
  }
};

// ===== BASELINE DEMAND =====

/**
 * Calculate baseline demand for a trial
 * @param {number} trialSeq - Trial sequence number
 * @param {number} enrollVersion - Enrollment version (optional)
 * @param {number} dosageVersion - Dosage version (optional)
 * @param {boolean} includeRecords - Include detailed records
 * @returns {Promise<Object>} Baseline demand summary and breakdown
 */
export const calculateBaselineDemand = async (
  trialSeq,
  enrollVersion = null,
  dosageVersion = null,
  includeRecords = false
) => {
  try {
    console.log('[API:BaselineDemand] Starting request with params:', {
      trialSeq,
      enrollVersion,
      dosageVersion,
      includeRecords
    });
    
    const payload = {
      trial_seq: trialSeq,
      enroll_version: enrollVersion,
      dosage_version: dosageVersion,
      include_records: includeRecords
    };
    
    console.log('[API:BaselineDemand] Payload:', payload);
    
    const response = await apiClient.post('/baseline-demand', payload, {
      params: { include_records: includeRecords }
    });
    
    console.log('[API:BaselineDemand] Response received:', {
      status: response.status,
      dataKeys: Object.keys(response.data),
      totalDemand: response.data.total_demand,
      byCountry: Object.keys(response.data.by_country || {}).length + ' countries'
    });
    
    return response.data;
  } catch (error) {
    console.error('[API:BaselineDemand] Error occurred:', {
      message: error.message,
      status: error.response?.status,
      detail: error.response?.data?.detail,
      fullError: error.response?.data
    });
    throw new Error(`Failed to calculate baseline demand: ${error.message}`);
  }
};

// ===== SCENARIO ANALYSIS =====

/**
 * Apply a scenario modification to enrollments
 * @param {number} trialSeq - Trial sequence number
 * @param {string} scenarioName - Name of the scenario
 * @param {string[]} affectedCountries - Countries to adjust
 * @param {number} reductionFactor - Fraction to reduce (0.30 = 30%)
 * @param {number} startMonth - Month to start reduction
 * @param {number} enrollVersion - Enrollment version (optional)
 * @param {number} dosageVersion - Dosage version (optional)
 * @param {boolean} includeRecords - Include detailed records
 * @returns {Promise<Object>} Scenario demand results
 */
export const applyScenario = async (
  trialSeq,
  scenarioName,
  affectedCountries,
  reductionFactor,
  startMonth,
  enrollVersion = null,
  dosageVersion = null,
  includeRecords = false
) => {
  try {
    const response = await apiClient.post('/scenario', {
      trial_seq: trialSeq,
      scenario_name: scenarioName,
      affected_countries: affectedCountries,
      reduction_factor: reductionFactor,
      start_month: startMonth,
      enroll_version: enrollVersion,
      dosage_version: dosageVersion,
      include_records: includeRecords
    }, {
      params: { include_records: includeRecords }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to apply scenario: ${error.message}`);
  }
};

// ===== COMPARISON =====

/**
 * Compare baseline demand with a scenario
 * @param {object} baselineRequest - Baseline demand request parameters
 * @param {object} scenarioRequest - Scenario request parameters
 * @returns {Promise<Object>} Comparison analysis
 */
export const compareScenario = async (baselineRequest, scenarioRequest) => {
  try {
    const response = await apiClient.post('/compare-scenario', {
      baseline_request: baselineRequest,
      scenario_request: scenarioRequest
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to compare scenarios: ${error.message}`);
  }
};

export default apiClient;
