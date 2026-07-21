import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../services/api';

// ===== PREDEFINED SCENARIOS (from Scenarios and Graphs.docx, item #10) =====
const PREDEFINED_SCENARIOS = [
  {
    id: 'base_case',
    name: 'Base Case',
    icon: '📋',
    description: 'Current baseline forecast with no modifications. Use as reference point.',
    enrollmentChange: '–',
    leadTimeChange: '–',
    demandImpact: '–',
    completionImpact: '–',
    reductionFactor: 0,
    isBaseCase: true,
    selectAllCountries: false,
    countryMode: 'none',
  },
  {
    id: 'enrollment_plus_20',
    name: 'Enrollment +20%',
    icon: '📈',
    description: 'Enrollment increases by 20% across all countries — assess supply chain readiness for accelerated enrollment.',
    enrollmentChange: '+20%',
    leadTimeChange: 'No Change',
    demandImpact: '+20%',
    completionImpact: '-2 Months',
    reductionFactor: -0.20,
    isBaseCase: false,
    selectAllCountries: true,
    countryMode: 'all',
  },
  {
    id: 'lead_time_plus_1m',
    name: 'Lead Time +1 Month',
    icon: '⏱️',
    description: 'Supply lead time increases by 1 month. Enrollment unchanged but demand shifts earlier to compensate.',
    enrollmentChange: 'No Change',
    leadTimeChange: '+1 Month',
    demandImpact: '+22%',
    completionImpact: '-1 Month',
    reductionFactor: -0.22,
    isBaseCase: false,
    selectAllCountries: true,
    countryMode: 'all',
  },
  {
    id: 'site_closure_top3',
    name: 'Site Closure (Top 3)',
    icon: '🏥',
    description: 'Top 3 contributing countries experience 15% enrollment reduction due to site closures.',
    enrollmentChange: '-15%',
    leadTimeChange: 'No Change',
    demandImpact: '-15%',
    completionImpact: '+1 Month',
    reductionFactor: 0.15,
    isBaseCase: false,
    selectAllCountries: false,
    countryMode: 'top3',
  },
  {
    id: 'country_closure',
    name: 'Country Closure',
    icon: '🌍',
    description: 'One or more countries exit the trial with a 25% enrollment reduction. Select affected countries below.',
    enrollmentChange: '-25%',
    leadTimeChange: 'No Change',
    demandImpact: '-25%',
    completionImpact: '+2 Months',
    reductionFactor: 0.25,
    isBaseCase: false,
    selectAllCountries: false,
    countryMode: 'manual',
  },
  {
    id: 'enrollment_plus_lead_time',
    name: 'Enrollment +20% & Lead Time +1 Month',
    icon: '🔀',
    description: 'Combined scenario: enrollment increases 20% AND lead time extends by 1 month. Compound effect analysis.',
    enrollmentChange: '+20%',
    leadTimeChange: '+1 Month',
    demandImpact: '+44%',
    completionImpact: '-3 Months',
    reductionFactor: -0.44,
    isBaseCase: false,
    selectAllCountries: true,
    countryMode: 'all',
  },
];

// ===== HELPERS =====
function getImpactClass(value) {
  if (!value || value === '–') return 'impact-neutral';
  if (value.startsWith('+')) return 'impact-positive';
  if (value.startsWith('-')) return 'impact-negative';
  return 'impact-neutral';
}

function getTagClass(value) {
  if (!value || value === '–' || value === 'No Change') return 'neutral';
  if (value.startsWith('+')) return 'positive';
  if (value.startsWith('-')) return 'negative';
  return 'info';
}

function getDeltaClass(value) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

function formatDelta(value, suffix = '') {
  if (value === 0) return `–`;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString()}${suffix}`;
}

// ===== COMPONENT =====
function ScenarioSimulation({ trialSeq, programSeq, baselineData, onSubmit, loading: parentLoading }) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [affectedCountries, setAffectedCountries] = useState([]);
  const [reductionFactor, setReductionFactor] = useState(0.30);
  const [startMonth, setStartMonth] = useState(1);
  const [enrollVersion, setEnrollVersion] = useState('');
  const [dosageVersion, setDosageVersion] = useState('');
  const [enrollmentVersions, setEnrollmentVersions] = useState([]);
  const [dosingVersions, setDosingVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [scenarioName, setScenarioName] = useState('');

  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [scenarioHistory, setScenarioHistory] = useState([]);

  // Derive country list from baseline data
  const availableCountries = useMemo(() => {
    if (!baselineData?.by_country) return [];
    return Object.entries(baselineData.by_country)
      .sort(([, a], [, b]) => b - a) // sort by demand descending
      .map(([country]) => country);
  }, [baselineData]);

  // Fetch versions when trial changes
  useEffect(() => {
    if (trialSeq) {
      fetchVersions();
    }
  }, [trialSeq]);

  const fetchVersions = async () => {
    try {
      setVersionsLoading(true);
      const [enrollData, dosingData] = await Promise.all([
        api.getEnrollmentVersions(trialSeq),
        api.getDosingVersions(trialSeq),
      ]);

      setEnrollmentVersions(enrollData.versions || []);
      setDosingVersions(dosingData.versions || []);

      if (enrollData.latest_version) setEnrollVersion(enrollData.latest_version.toString());
      if (dosingData.latest_version) setDosageVersion(dosingData.latest_version.toString());
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  // When a preset is selected, configure defaults
  const handlePresetSelect = (preset) => {
    setSelectedPreset(preset);
    setScenarioName(preset.name);
    setRunError(null);
    setLatestResult(null);

    // Set reduction factor from preset
    setReductionFactor(Math.abs(preset.reductionFactor));

    // Set countries based on mode
    if (preset.countryMode === 'all') {
      setAffectedCountries([...availableCountries]);
    } else if (preset.countryMode === 'top3') {
      setAffectedCountries(availableCountries.slice(0, 3));
    } else if (preset.countryMode === 'none') {
      setAffectedCountries([]);
    } else {
      setAffectedCountries([]);
    }

    setStartMonth(1);
  };

  const handleCountryToggle = (country) => {
    setAffectedCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    );
  };

  const handleSelectAllCountries = () => {
    if (affectedCountries.length === availableCountries.length) {
      setAffectedCountries([]);
    } else {
      setAffectedCountries([...availableCountries]);
    }
  };

  const handleRunScenario = async () => {
    if (!selectedPreset) return;

    // Base case - just show baseline as result
    if (selectedPreset.isBaseCase) {
      const baseCaseResult = {
        id: Date.now(),
        presetId: selectedPreset.id,
        scenarioName: 'Base Case',
        enrollmentChange: '–',
        leadTimeChange: '–',
        demandImpact: '–',
        completionImpact: '–',
        baseline_patients: baselineData?.total_planned_subjects || 0,
        scenario_patients: baselineData?.total_planned_subjects || 0,
        patient_reduction: 0,
        patient_reduction_pct: 0,
        baseline_demand: baselineData?.total_demand || 0,
        scenario_demand: baselineData?.total_demand || 0,
        demand_reduction: 0,
        demand_reduction_pct: 0,
        by_country: baselineData?.by_country || {},
        by_item: baselineData?.by_item || {},
        isBaseCase: true,
      };
      setLatestResult(baseCaseResult);
      setScenarioHistory((prev) => [baseCaseResult, ...prev]);
      return;
    }

    if (affectedCountries.length === 0) {
      setRunError('Please select at least one affected country.');
      return;
    }

    setRunLoading(true);
    setRunError(null);

    try {
      const result = await api.applyScenario(
        trialSeq,
        programSeq,
        scenarioName || selectedPreset.name,
        affectedCountries,
        reductionFactor,
        startMonth,
        enrollVersion ? parseInt(enrollVersion) : null,
        dosageVersion ? parseInt(dosageVersion) : null,
        true
      );

      const historyEntry = {
        id: Date.now(),
        presetId: selectedPreset.id,
        scenarioName: scenarioName || selectedPreset.name,
        enrollmentChange: selectedPreset.enrollmentChange,
        leadTimeChange: selectedPreset.leadTimeChange,
        demandImpact: result.demand_reduction_pct
          ? `${result.demand_reduction_pct > 0 ? '-' : '+'}${Math.abs(result.demand_reduction_pct).toFixed(1)}%`
          : selectedPreset.demandImpact,
        completionImpact: selectedPreset.completionImpact,
        ...result,
        affectedCountries: [...affectedCountries],
        reductionFactor,
        isBaseCase: false,
      };

      setLatestResult(historyEntry);
      setScenarioHistory((prev) => [historyEntry, ...prev]);
    } catch (err) {
      console.error('Scenario failed:', err);
      setRunError(err.message || 'Failed to run scenario');
    } finally {
      setRunLoading(false);
    }
  };

  const handleClearHistory = () => {
    setScenarioHistory([]);
    setLatestResult(null);
  };

  const isLoading = parentLoading || runLoading;

  // ===== RENDER =====
  return (
    <div>
      {/* Baseline gate */}
      {!baselineData && (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <span>ℹ️</span>
          <span>Please calculate baseline demand first (in the Baseline Demand tab) to enable scenario simulation.</span>
        </div>
      )}

      {baselineData && (
        <>
          {/* SECTION 1: Predefined Scenario Cards */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 className="scenario-section-title">
              🎯 Choose a Scenario
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Select a predefined what-if scenario to analyze its impact on demand forecasting and study timelines.
            </p>
            <div className="scenario-presets-grid">
              {PREDEFINED_SCENARIOS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`scenario-preset-card ${selectedPreset?.id === preset.id ? 'selected' : ''} ${preset.isBaseCase ? 'base-case' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                  disabled={isLoading}
                >
                  <div className="preset-icon">{preset.icon}</div>
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-tags">
                    {preset.enrollmentChange !== '–' && (
                      <span className={`preset-tag ${getTagClass(preset.enrollmentChange)}`}>
                        👥 {preset.enrollmentChange}
                      </span>
                    )}
                    {preset.leadTimeChange !== '–' && preset.leadTimeChange !== 'No Change' && (
                      <span className={`preset-tag ${getTagClass(preset.leadTimeChange)}`}>
                        ⏱️ {preset.leadTimeChange}
                      </span>
                    )}
                    {preset.demandImpact !== '–' && (
                      <span className={`preset-tag ${getTagClass(preset.demandImpact)}`}>
                        📦 {preset.demandImpact}
                      </span>
                    )}
                  </div>
                  <div className="preset-desc">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 2: Configuration Panel */}
          {selectedPreset && !selectedPreset.isBaseCase && (
            <div className="scenario-config-panel">
              <div className="config-header">
                <h4>
                  {selectedPreset.icon} Configure: {selectedPreset.name}
                </h4>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => { setSelectedPreset(null); setLatestResult(null); }}
                >
                  ✕ Clear
                </button>
              </div>

              {/* Scenario Name */}
              <div className="form-group">
                <label htmlFor="sim-scenario-name">Scenario Name</label>
                <input
                  id="sim-scenario-name"
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g., EU Site Closure Q3"
                />
              </div>

              {/* Country Selection */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0 }}>Affected Countries</label>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={handleSelectAllCountries}
                    disabled={isLoading}
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                  >
                    {affectedCountries.length === availableCountries.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {availableCountries.map((country) => {
                    const demand = baselineData.by_country[country] || 0;
                    const pct = baselineData.total_demand > 0
                      ? ((demand / baselineData.total_demand) * 100).toFixed(1)
                      : '0.0';
                    return (
                      <label
                        key={country}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          background: affectedCountries.includes(country)
                            ? 'var(--primary-light)'
                            : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={affectedCountries.includes(country)}
                          onChange={() => handleCountryToggle(country)}
                          disabled={isLoading}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{country}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {pct}%
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Parameters Row */}
              <div className="form-row three">
                <div className="form-group">
                  <label htmlFor="sim-reduction">Reduction Factor (0-1)</label>
                  <input
                    id="sim-reduction"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={reductionFactor}
                    onChange={(e) => setReductionFactor(parseFloat(e.target.value) || 0)}
                    disabled={isLoading}
                  />
                  <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.25rem' }}>
                    {reductionFactor >= 0
                      ? `${(reductionFactor * 100).toFixed(0)}% enrollment reduction`
                      : `${(Math.abs(reductionFactor) * 100).toFixed(0)}% enrollment increase`}
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="sim-start-month">Start Month</label>
                  <input
                    id="sim-start-month"
                    type="number"
                    min="1"
                    value={startMonth}
                    onChange={(e) => setStartMonth(parseInt(e.target.value) || 1)}
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <label>Preview</label>
                  <div style={{
                    background: '#f8f9fa',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}>
                    {affectedCountries.length > 0
                      ? `${affectedCountries.length} countries, ${(reductionFactor * 100).toFixed(0)}% reduction from month ${startMonth}`
                      : 'Select countries to preview'}
                  </div>
                </div>
              </div>

              {/* Version Selectors */}
              <div className="form-row two">
                <div className="form-group">
                  <label htmlFor="sim-enroll-ver">Enrollment Version</label>
                  {versionsLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading...</div>
                  ) : (
                    <select
                      id="sim-enroll-ver"
                      value={enrollVersion}
                      onChange={(e) => setEnrollVersion(e.target.value)}
                      disabled={isLoading || enrollmentVersions.length === 0}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                    >
                      <option value="">-- Select --</option>
                      {enrollmentVersions.map((v) => (
                        <option key={v} value={v}>Version {v}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="sim-dosage-ver">Dosage Version</label>
                  {versionsLoading ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading...</div>
                  ) : (
                    <select
                      id="sim-dosage-ver"
                      value={dosageVersion}
                      onChange={(e) => setDosageVersion(e.target.value)}
                      disabled={isLoading || dosingVersions.length === 0}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                    >
                      <option value="">-- Select --</option>
                      {dosingVersions.map((v) => (
                        <option key={v} value={v}>Version {v}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Error */}
              {runError && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                  <span>⚠️</span>
                  <span>{runError}</span>
                </div>
              )}

              {/* Run Button */}
              <button
                type="button"
                className="btn btn-primary btn-large btn-block"
                onClick={handleRunScenario}
                disabled={isLoading || versionsLoading || affectedCountries.length === 0}
              >
                {runLoading ? '⏳ Running Scenario...' : `🚀 Run "${scenarioName || selectedPreset.name}"`}
              </button>
            </div>
          )}

          {/* Base Case - simple run button */}
          {selectedPreset?.isBaseCase && (
            <div className="scenario-config-panel">
              <div className="config-header">
                <h4>📋 Base Case — No Modifications</h4>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={() => { setSelectedPreset(null); setLatestResult(null); }}
                >
                  ✕ Clear
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                The base case represents the current baseline forecast with no scenario modifications. Click below to add it to the comparison table.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-large btn-block"
                onClick={handleRunScenario}
                disabled={isLoading}
              >
                📋 Add Base Case to Comparison
              </button>
            </div>
          )}

          {/* SECTION 3: Latest Result Dashboard */}
          {latestResult && (
            <div className="scenario-results">
              <div className="scenario-section">
                <div className="results-header">
                  <h3 className="scenario-section-title" style={{ margin: 0, borderTop: 'none', paddingTop: 0 }}>
                    📊 Results: {latestResult.scenarioName}
                  </h3>
                </div>

                {/* KPI Cards */}
                <div className="scenario-kpi-grid">
                  <div className="scenario-kpi-card">
                    <div className="kpi-label">Baseline Patients</div>
                    <div className="kpi-value">{(latestResult.baseline_patients || 0).toLocaleString()}</div>
                  </div>
                  <div className={`scenario-kpi-card ${latestResult.patient_reduction > 0 ? 'negative' : latestResult.patient_reduction < 0 ? 'positive' : ''}`}>
                    <div className="kpi-label">Scenario Patients</div>
                    <div className="kpi-value">{(latestResult.scenario_patients || 0).toLocaleString()}</div>
                    {!latestResult.isBaseCase && (
                      <div className={`kpi-delta ${getDeltaClass(-latestResult.patient_reduction)}`}>
                        {formatDelta(-latestResult.patient_reduction)} ({formatDelta(-latestResult.patient_reduction_pct, '%')})
                      </div>
                    )}
                  </div>
                  <div className="scenario-kpi-card">
                    <div className="kpi-label">Baseline Demand</div>
                    <div className="kpi-value">{(latestResult.baseline_demand || 0).toLocaleString()}</div>
                  </div>
                  <div className={`scenario-kpi-card ${latestResult.demand_reduction > 0 ? 'negative' : latestResult.demand_reduction < 0 ? 'positive' : ''}`}>
                    <div className="kpi-label">Scenario Demand</div>
                    <div className="kpi-value">{(latestResult.scenario_demand || 0).toLocaleString()}</div>
                    {!latestResult.isBaseCase && (
                      <div className={`kpi-delta ${getDeltaClass(-latestResult.demand_reduction)}`}>
                        {formatDelta(-latestResult.demand_reduction)} ({formatDelta(-latestResult.demand_reduction_pct, '%')})
                      </div>
                    )}
                  </div>
                  {!latestResult.isBaseCase && (
                    <>
                      <div className={`scenario-kpi-card warning`}>
                        <div className="kpi-label">Demand Reduction</div>
                        <div className="kpi-value" style={{ color: latestResult.demand_reduction > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {Math.abs(latestResult.demand_reduction_pct || 0).toFixed(1)}%
                        </div>
                        <div className="kpi-delta" style={{ color: 'var(--text-secondary)' }}>
                          {(latestResult.demand_reduction || 0).toLocaleString()} units
                        </div>
                      </div>
                      <div className="scenario-kpi-card">
                        <div className="kpi-label">Completion Impact</div>
                        <div className="kpi-value" style={{ fontSize: '1.3rem' }}>{latestResult.completionImpact}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Impact by Country */}
                {!latestResult.isBaseCase && latestResult.by_country && Object.keys(latestResult.by_country).length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>🌍 Impact by Country</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="scenario-history-table">
                        <thead>
                          <tr>
                            <th>Country</th>
                            <th>Baseline Demand</th>
                            <th>Scenario Demand</th>
                            <th>Change</th>
                            <th>% Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(latestResult.by_country)
                            .sort(([, a], [, b]) => b - a)
                            .map(([country, scenarioDemand]) => {
                              const baselineDemand = baselineData?.by_country?.[country] || 0;
                              const change = scenarioDemand - baselineDemand;
                              const pctChange = baselineDemand > 0 ? (change / baselineDemand) * 100 : 0;
                              return (
                                <tr key={country}>
                                  <td><strong>{country}</strong></td>
                                  <td>{baselineDemand.toLocaleString()}</td>
                                  <td>{scenarioDemand.toLocaleString()}</td>
                                  <td>
                                    <span className={`impact-badge ${getImpactClass(change > 0 ? '+' : change < 0 ? '-' : '')}`}>
                                      {change > 0 ? '+' : ''}{change.toLocaleString()}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`impact-badge ${getImpactClass(pctChange > 0 ? '+' : pctChange < 0 ? '-' : '')}`}>
                                      {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Impact by Item */}
                {!latestResult.isBaseCase && latestResult.by_item && Object.keys(latestResult.by_item).length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-primary)' }}>📦 Impact by Item</h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="scenario-history-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Baseline Demand</th>
                            <th>Scenario Demand</th>
                            <th>Change</th>
                            <th>% Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(latestResult.by_item)
                            .sort(([, a], [, b]) => b - a)
                            .map(([item, scenarioDemand]) => {
                              const baselineDemand = baselineData?.by_item?.[item] || 0;
                              const change = scenarioDemand - baselineDemand;
                              const pctChange = baselineDemand > 0 ? (change / baselineDemand) * 100 : 0;
                              return (
                                <tr key={item}>
                                  <td><strong>{item}</strong></td>
                                  <td>{baselineDemand.toLocaleString()}</td>
                                  <td>{scenarioDemand.toLocaleString()}</td>
                                  <td>
                                    <span className={`impact-badge ${getImpactClass(change > 0 ? '+' : change < 0 ? '-' : '')}`}>
                                      {change > 0 ? '+' : ''}{change.toLocaleString()}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={`impact-badge ${getImpactClass(pctChange > 0 ? '+' : pctChange < 0 ? '-' : '')}`}>
                                      {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 4: Scenario Comparison History Table */}
          {scenarioHistory.length > 0 && (
            <div className="scenario-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="scenario-section-title" style={{ margin: 0 }}>
                  📊 Scenario Comparison
                </h3>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  onClick={handleClearHistory}
                  style={{ fontSize: '0.8rem' }}
                >
                  🗑️ Clear All
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Side-by-side comparison of all scenarios run in this session.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table className="scenario-history-table">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Enrollment Change</th>
                      <th>Lead Time Change</th>
                      <th>Forecasted Demand Impact (%)</th>
                      <th>Study Completion Impact</th>
                      <th>Baseline Demand</th>
                      <th>Scenario Demand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.scenarioName}</strong>
                        </td>
                        <td>
                          <span className={`impact-badge ${getImpactClass(entry.enrollmentChange)}`}>
                            {entry.enrollmentChange}
                          </span>
                        </td>
                        <td>
                          <span className={`impact-badge ${entry.leadTimeChange === 'No Change' || entry.leadTimeChange === '–' ? 'impact-neutral' : 'impact-positive'}`}>
                            {entry.leadTimeChange}
                          </span>
                        </td>
                        <td>
                          <span className={`impact-badge ${getImpactClass(entry.demandImpact)}`}>
                            {entry.demandImpact}
                          </span>
                        </td>
                        <td>
                          <span className={`impact-badge ${getImpactClass(entry.completionImpact)}`}>
                            {entry.completionImpact}
                          </span>
                        </td>
                        <td>{(entry.baseline_demand || 0).toLocaleString()}</td>
                        <td>{(entry.scenario_demand || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ScenarioSimulation;
