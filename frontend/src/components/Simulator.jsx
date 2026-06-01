import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import * as api from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MIN_RUNS = 1000;
const MAX_RUNS = 10000;

function Simulator({ trialSeq, onSimulate, loading }) {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [error, setError] = useState(null);

  const [enrollmentMin, setEnrollmentMin] = useState(0);
  const [enrollmentMax, setEnrollmentMax] = useState(0);
  const [dropoutRate, setDropoutRate] = useState(15);
  const [doseRate, setDoseRate] = useState(4);
  const [wastageRate, setWastageRate] = useState(8);
  const [simulationRuns, setSimulationRuns] = useState(5000);

  const [simulationResult, setSimulationResult] = useState(null);
  const debounceRef = useRef(null);
  const AUTO_RUN_DELAY = 50; // ms

  useEffect(() => {
    if (!trialSeq) {
      setSummary(null);
      setSimulationResult(null);
      setError(null);
      return;
    }

    fetchEnrollmentSummary();
  }, [trialSeq]);

  const fetchEnrollmentSummary = async () => {
    try {
      setLoadingSummary(true);
      setError(null);
      const data = await api.getEnrollmentSummary(trialSeq);
      setSummary(data);
      setEnrollmentMin(data.enrollment_min ?? 0);
      setEnrollmentMax(data.enrollment_max ?? 0);

      const currentDropout = data.total_planned
        ? ((data.total_planned - data.total_actual) / data.total_planned) * 100
        : 0;
      setDropoutRate(Math.min(50, Math.max(0, parseFloat(currentDropout.toFixed(1)))));
    } catch (err) {
      console.error('Failed to fetch enrollment summary:', err);
      setError((err && err.message) || String(err) || 'Unable to load enrollment summary.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const clearResults = () => setSimulationResult(null);

  const scheduleAutoRun = () => {
    // clear previous pending run
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // hide previous results while new run is pending
    setSimulationResult(null);

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // only run if inputs valid and not currently loading
      if (!loadingSummary && !runLoading) {
        handleSimulate();
      }
    }, AUTO_RUN_DELAY);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const validateInputs = () => {
    if (enrollmentMin > enrollmentMax) {
      setError('Enrollment min cannot be greater than enrollment max.');
      return false;
    }
    if (dropoutRate < 0 || dropoutRate > 50) {
      setError('Dropout rate must be between 0 and 50%.');
      return false;
    }
    return true;
  };

  const runSimulation = () => {
    const runs = Math.max(MIN_RUNS, Math.min(simulationRuns, MAX_RUNS));
    const annualValues = [];

    for (let i = 0; i < runs; i += 1) {
      let annualDemand = 0;
      for (let month = 0; month < 12; month += 1) {
        const monthlyEnrollment = enrollmentMin + Math.random() * Math.max(0, enrollmentMax - enrollmentMin);
        const demand = monthlyEnrollment * (1 - dropoutRate / 100) * doseRate * (1 + wastageRate / 100);
        annualDemand += demand;
      }
      annualValues.push(Math.round(annualDemand));
    }

    annualValues.sort((a, b) => a - b);
    const p10 = annualValues[Math.floor(runs * 0.1)] || 0;
    const p50 = annualValues[Math.floor(runs * 0.5)] || 0;
    const p90 = annualValues[Math.floor(runs * 0.9)] || 0;
    const avg = Math.round(annualValues.reduce((sum, value) => sum + value, 0) / runs) || 0;
    const spread = p50 > 0 ? Math.round(((p90 - p10) / p50) * 100) : 0;
    const stockoutRisk = Math.round((annualValues.filter((value) => value > p90).length / runs) * 100);

    const monthlyEnrollments = MONTHS.map(() =>
      Math.round(enrollmentMin + Math.random() * Math.max(0, enrollmentMax - enrollmentMin))
    );
    const monthlyDemands = monthlyEnrollments.map((enrollment) =>
      Math.round(enrollment * (1 - dropoutRate / 100) * doseRate * (1 + wastageRate / 100))
    );

    return {
      values: annualValues,
      p10,
      p50,
      p90,
      avg,
      spread,
      stockoutRisk,
      monthlyEnrollments,
      monthlyDemands,
      runs
    };
  };

  const handleSimulate = async () => {
    setError(null);
    if (!validateInputs()) return;

    setRunLoading(true);
    try {
      const result = runSimulation();
      setSimulationResult(result);

      if (onSimulate) {
        onSimulate({
          trial_seq: trialSeq,
          enrollment_min: enrollmentMin,
          enrollment_max: enrollmentMax,
          dropout_rate: parseFloat(dropoutRate),
          dose_rate: doseRate,
          wastage_rate: wastageRate,
          simulation_runs: simulationRuns
        });
      }
    } catch (err) {
      console.error('Simulation failed:', err);
      setError((err && err.message) || String(err) || 'Unable to complete simulation.');
    } finally {
      setRunLoading(false);
    }
  };

  const riskClass = useMemo(() => {
    if (!simulationResult) return '';
    if (simulationResult.stockoutRisk < 10) return 'risk-low';
    if (simulationResult.stockoutRisk < 20) return 'risk-mid';
    return 'risk-high';
  }, [simulationResult]);

  const histogramLayout = useMemo(() => {
    if (!simulationResult) return null;
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label + '+',
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, color: '#888780' },
          grid: { display: false }
        },
        y: {
          ticks: { font: { size: 10 }, color: '#888780' },
          grid: { color: 'rgba(136,135,128,0.15)' }
        }
      }
    };
  }, [simulationResult]);

  const trendLayout = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      filler: { propagate: true }
    },
    scales: {
      x: {
        ticks: { font: { size: 10 }, color: '#888780' },
        grid: { display: false }
      },
      y: {
        ticks: { font: { size: 10 }, color: '#888780' },
        grid: { color: 'rgba(136,135,128,0.15)' }
      }
    }
  }), []);

  const histogramData = useMemo(() => {
    if (!simulationResult) return {};
    const bucketSize = Math.max(1, Math.round((simulationResult.p90 - simulationResult.p10) / 10));
    const histLabels = [];
    const histCounts = [];
    
    for (let i = 0; i < 10; i++) {
      const lo = simulationResult.p10 + i * bucketSize;
      const hi = lo + bucketSize;
      histLabels.push(lo.toLocaleString());
      histCounts.push(simulationResult.values.filter(x => x >= lo && x < hi).length);
    }

    return {
      labels: histLabels,
      datasets: [
        {
          label: 'Count',
          data: histCounts,
          backgroundColor: '#378ADD',
          borderRadius: 4,
          borderSkipped: false
        }
      ]
    };
  }, [simulationResult]);

  const trendData = useMemo(() => {
    if (!simulationResult) return {};
    return {
      labels: MONTHS,
      datasets: [
        {
          label: 'Enrollment',
          data: simulationResult.monthlyEnrollments,
          borderColor: '#378ADD',
          backgroundColor: 'rgba(55,138,221,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#378ADD',
          pointBorderColor: '#378ADD',
          pointBorderWidth: 0,
          fill: true,
          tension: 0.35,
          spanGaps: true
        },
        {
          label: 'Demand',
          data: simulationResult.monthlyDemands,
          borderColor: '#1D9E75',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 3],
          pointRadius: 3,
          pointBackgroundColor: '#1D9E75',
          pointBorderColor: '#1D9E75',
          pointBorderWidth: 0,
          fill: false,
          tension: 0.35,
          spanGaps: true
        }
      ]
    };
  }, [simulationResult]);

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Monte Carlo Clinical Trial Simulator</h2>
        <p>Estimate demand risk and planning buffers from Snowflake enrollment data.</p>
      </div>

      {!trialSeq && (
        <div className="alert alert-info">
          <span>ℹ️</span>
          <span>Select a trial to load enrollment summary data and start the simulation.</span>
        </div>
      )}

      {trialSeq && loadingSummary && (
        <div className="loading" aria-live="polite">
          <div className="spinner"></div>
          <span>Loading enrollment summary…</span>
        </div>
      )}

      {trialSeq && error && (
        <div className="alert alert-danger" role="alert">
          <span></span>
          <span>{error}</span>
        </div>
      )}

      {trialSeq && summary && !loadingSummary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Simulation inputs</h3>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="enrollment-min" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  <span>Enrollment min</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{enrollmentMin.toLocaleString()}</span>
                </label>
                <input
                  id="enrollment-min"
                  className="range-input"
                  type="range"
                  min="0"
                  max={Math.max(summary.enrollment_max ?? 0, enrollmentMin + 1, 1)}
                  step="1"
                  value={enrollmentMin}
                  onChange={(e) => {
                    setEnrollmentMin(parseInt(e.target.value, 10) || 0);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(summary.enrollment_max ?? 0, enrollmentMin + 1, 1)}
                  aria-valuenow={enrollmentMin}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="enrollment-max" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  <span>Enrollment max</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{enrollmentMax.toLocaleString()}</span>
                </label>
                <input
                  id="enrollment-max"
                  className="range-input"
                  type="range"
                  min={enrollmentMin}
                  max={Math.max(summary.enrollment_max ?? 0, enrollmentMin + 1, 1)}
                  step="1"
                  value={enrollmentMax}
                  onChange={(e) => {
                    setEnrollmentMax(parseInt(e.target.value, 10) || 0);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={enrollmentMin}
                  aria-valuemax={Math.max(summary.enrollment_max ?? 0, enrollmentMin + 1, 1)}
                  aria-valuenow={enrollmentMax}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="dropout-rate" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  <span>Dropout rate %</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{dropoutRate.toFixed(1)}%</span>
                </label>
                <input
                  id="dropout-rate"
                  className="range-input"
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={dropoutRate}
                  onChange={(e) => {
                    setDropoutRate(parseFloat(e.target.value) || 0);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={0}
                  aria-valuemax={50}
                  aria-valuenow={dropoutRate}
                  style={{ width: '100%' }}
                />
              </div>

              {/* <div className="form-group">
                <label htmlFor="dose-rate">Dose rate</label>
                <input
                  id="dose-rate"
                  className="range-input"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={doseRate}
                  onChange={(e) => {
                    setDoseRate(parseInt(e.target.value, 10) || 1);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuenow={doseRate}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <span>Dose rate</span>
                  <span>{doseRate}</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="wastage-rate">Wastage %</label>
                <input
                  id="wastage-rate"
                  className="range-input"
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={wastageRate}
                  onChange={(e) => {
                    setWastageRate(parseInt(e.target.value, 10) || 0);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={0}
                  aria-valuemax={25}
                  aria-valuenow={wastageRate}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <span>Wastage</span>
                  <span>{wastageRate}%</span>
                </div>
              </div> */}

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="simulation-runs" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  <span>Simulation runs</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{simulationRuns.toLocaleString()}</span>
                </label>
                <input
                  id="simulation-runs"
                  className="range-input"
                  type="range"
                  min={MIN_RUNS}
                  max={MAX_RUNS}
                  step="1000"
                  value={simulationRuns}
                  onChange={(e) => {
                    setSimulationRuns(parseInt(e.target.value, 10) || MIN_RUNS);
                    scheduleAutoRun();
                  }}
                  aria-valuemin={MIN_RUNS}
                  aria-valuemax={MAX_RUNS}
                  aria-valuenow={simulationRuns}
                  style={{ width: '100%' }}
                />
              </div>

              {/* <button
                type="button"
                className="btn btn-primary btn-large btn-block"
                onClick={handleSimulate}
                disabled={loading || runLoading || loadingSummary}
              >
                {runLoading ? '⏳ Running simulation…' : 'Run Simulation'}
              </button> */}

              {!simulationResult && (
                <p className="text-muted mt-2" style={{ fontSize: '0.95rem' }}>
                  Adjust sliders and click Run Simulation to generate demand risk KPIs and charts.
                </p>
              )}

              <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Enrollment summary</div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Planned patients</span>
                    <strong>{summary.total_planned?.toLocaleString() ?? '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Actual patients</span>
                    <strong>{summary.total_actual?.toLocaleString() ?? '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Enrollment range</span>
                    <strong>{summary.enrollment_min?.toLocaleString() ?? '0'} – {summary.enrollment_max?.toLocaleString() ?? '0'}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div>
              {simulationResult && (
                <>
                  <div className="grid cols-2" style={{ marginBottom: '1rem' }}>
                    <div className="stat-box">
                      <div className="stat-label">P10 demand</div>
                      <div className="stat-value">{simulationResult.p10.toLocaleString()}</div>
                      <div className="stat-label">Conservative low</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-label">P50 demand</div>
                      <div className="stat-value">{simulationResult.p50.toLocaleString()}</div>
                      <div className="stat-label">Median estimate</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-label">P90 demand</div>
                      <div className="stat-value">{simulationResult.p90.toLocaleString()}</div>
                      <div className="stat-label">Planning buffer</div>
                    </div>
                    <div className="stat-box">
                      <div className="stat-label">Average demand</div>
                      <div className="stat-value">{simulationResult.avg.toLocaleString()}</div>
                      <div className="stat-label">Expected annual</div>
                    </div>
                  </div>

                  <div className="card" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Simulation insight</div>
                        <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          Demand spread is {simulationResult.spread}% between P10 and P90. This view reflects uncertainty from enrollment variation, dropout, dosing, and wastage.
                        </div>
                      </div>
                      <div className="text-right" style={{ minWidth: '120px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Stockout risk</div>
                        <div className={`stat-value ${riskClass}`} style={{ fontSize: '2.2rem' }}>
                          {simulationResult.stockoutRisk}%
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {simulationResult && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                  <div className="chart-container" style={{ padding: '1rem' }}>
                    <div className="chart-title">Demand distribution</div>
                    <div style={{ position: 'relative', height: '220px' }}>
                      <Bar
                        data={histogramData}
                        options={histogramLayout}
                      />
                    </div>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Simulated demand counts across {simulationResult.runs.toLocaleString()} runs.
                    </div>
                  </div>

                  <div className="chart-container" style={{ padding: '1rem' }}>
                    <div className="chart-title">Monthly enrollment vs demand</div>
                    <div style={{ position: 'relative', height: '220px' }}>
                      <Line
                        data={trendData}
                        options={trendLayout}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

         
        </>
      )}
    </div>
  );
}

export default Simulator;
