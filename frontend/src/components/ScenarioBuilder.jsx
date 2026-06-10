import React, { useState, useEffect } from 'react';
import * as api from '../services/api';
import Simulator from './Simulator';
import EnrollmentDistribution from './EnrollmentDistribution';


function ScenarioBuilder({ trialSeq, baselineData, data, onSubmit, onCompare, loading }) {
  const [scenarioName, setScenarioName] = useState('');
  const [affectedCountries, setAffectedCountries] = useState([]);
  const [reductionFactor, setReductionFactor] = useState('0.30');
  const [startMonth, setStartMonth] = useState('1');
  const [enrollVersion, setEnrollVersion] = useState('');
  const [dosageVersion, setDosageVersion] = useState('');
  const [enrollmentVersions, setEnrollmentVersions] = useState([]);
  const [dosingVersions, setDosingVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(null);

  // Nested tab state for Scenario Modeling
  const [modelingTab, setModelingTab] = useState('scenario'); // 'scenario' or 'simulator'

  // Example countries (you can fetch these from API)
  const countryOptions = [
    'Germany (DE)',
    'France (FR)',
    'Italy (IT)',
    'Spain (ES)',
    'UK (GB)',
    'Canada (CA)',
    'USA (US)',
    'Australia (AU)'
  ];

  // Fetch available versions when trial changes
  useEffect(() => {
    if (trialSeq) {
      fetchVersions();
    }
  }, [trialSeq]);

  const fetchVersions = async () => {
    try {
      setVersionsLoading(true);
      setVersionsError(null);
      
      const [enrollData, dosingData] = await Promise.all([
        api.getEnrollmentVersions(trialSeq),
        api.getDosingVersions(trialSeq)
      ]);
      
      setEnrollmentVersions(enrollData.versions || []);
      setDosingVersions(dosingData.versions || []);
      
      // Pre-select latest versions
      if (enrollData.latest_version) {
        setEnrollVersion(enrollData.latest_version.toString());
      }
      if (dosingData.latest_version) {
        setDosageVersion(dosingData.latest_version.toString());
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
      setVersionsError(err.message);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleCountryToggle = (country) => {
    setAffectedCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (affectedCountries.length === 0) {
      alert('Please select at least one country');
      return;
    }
    onSubmit({
      trial_seq: trialSeq,
      scenario_name: scenarioName || 'Unnamed Scenario',
      affected_countries: affectedCountries,
      reduction_factor: parseFloat(reductionFactor),
      start_month: parseInt(startMonth),
      enroll_version: enrollVersion ? parseInt(enrollVersion) : null,
      dosage_version: dosageVersion ? parseInt(dosageVersion) : null,
    });
  };

  const handleSimulatorSubmit = async (params) => {
    // For simulator, we just calculate the projected demand
    // This could call a different API or be handled locally
    console.log('Simulator params:', params);
  };

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Scenario Modeling</h2>
        <p>Create "what-if" scenarios by adjusting enrollment assumptions</p>
      </div>

      {!baselineData && (
        <div className="alert alert-info">
          <span></span>
          <span>Please calculate baseline demand first</span>
        </div>
      )}

      {/* Nested Tabs for Scenario Modeling */}
      <div className="nested-tabs" style={{ marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color)' }}>
        <button
          type="button"
          className={`nested-tab-btn ${modelingTab === 'scenario' ? 'active' : ''}`}
          onClick={() => setModelingTab('scenario')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: '3px solid transparent',
            color: modelingTab === 'scenario' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottomColor: modelingTab === 'scenario' ? 'var(--primary)' : 'transparent',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
        >
          Scenario Builder
        </button>
        <button
          type="button"
          className={`nested-tab-btn ${modelingTab === 'distribution' ? 'active' : ''}`}
          onClick={() => setModelingTab('distribution')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: '3px solid transparent',
            color: modelingTab === 'distribution' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottomColor: modelingTab === 'distribution' ? 'var(--primary)' : 'transparent',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
        >
          📅 Enrollment Distribution
        </button>
        <button
          type="button"
          className={`nested-tab-btn ${modelingTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setModelingTab('simulator')}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'none',
            border: 'none',
            borderBottom: '3px solid transparent',
            color: modelingTab === 'simulator' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottomColor: modelingTab === 'simulator' ? 'var(--primary)' : 'transparent',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
        >
          Simulator
        </button>
      </div>

      {/* Tab Content */}
      {modelingTab === 'scenario' && (
        <div className="card-section">
          <form onSubmit={handleSubmit}>
          {versionsError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <span>{versionsError}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="scenario-name">Scenario Name:</label>
            <input
              id="scenario-name"
              type="text"
              placeholder="e.g., EU Region Slowdown"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Affected Countries:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {countryOptions.map((country) => (
                <label key={country} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={affectedCountries.includes(country)}
                    onChange={() => handleCountryToggle(country)}
                    disabled={loading}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  {country}
                </label>
              ))}
            </div>
          </div>

          <div className="form-row three">
            <div className="form-group">
              <label htmlFor="reduction">Reduction Factor (0-1):</label>
              <input
                id="reduction"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={reductionFactor}
                onChange={(e) => setReductionFactor(e.target.value)}
                disabled={loading}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                {`${(parseFloat(reductionFactor) * 100).toFixed(0)}% reduction`}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="start-month">Start Month:</label>
              <input
                id="start-month"
                type="number"
                min="1"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="visual-preview">Visual Preview:</label>
              <div style={{
                background: '#f0f0f0',
                padding: '1rem',
                borderRadius: '4px',
                textAlign: 'center',
                fontSize: '0.9rem'
              }}>
                {affectedCountries.length > 0 ? `Reducing ${affectedCountries.length} countries by ${(parseFloat(reductionFactor) * 100).toFixed(0)}%` : 'Select countries to preview'}
              </div>
            </div>
          </div>

          <div className="form-row two">
            <div className="form-group">
              <label htmlFor="enroll-version-scenario">Enrollment Version:</label>
              {versionsLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Loading versions...
                </div>
              ) : (
                <>
                  <select
                    id="enroll-version-scenario"
                    value={enrollVersion}
                    onChange={(e) => setEnrollVersion(e.target.value)}
                    disabled={loading || enrollmentVersions.length === 0}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    <option value="">-- Select Enrollment Version --</option>
                    {enrollmentVersions.map((version) => (
                      <option key={version} value={version}>
                        Version {version}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                    {enrollmentVersions.length > 0 && (
                      <>
                        Latest version: {Math.max(...enrollmentVersions)}
                      </>
                    )}
                  </small>
                </>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="dosage-version-scenario">Dosage Version:</label>
              {versionsLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Loading versions...
                </div>
              ) : (
                <>
                  <select
                    id="dosage-version-scenario"
                    value={dosageVersion}
                    onChange={(e) => setDosageVersion(e.target.value)}
                    disabled={loading || dosingVersions.length === 0}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    <option value="">-- Select Dosage Version --</option>
                    {dosingVersions.map((version) => (
                      <option key={version} value={version}>
                        Version {version}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                    {dosingVersions.length > 0 && (
                      <>
                        Latest version: {Math.max(...dosingVersions)}
                      </>
                    )}
                  </small>
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-large btn-block"
            disabled={loading || versionsLoading || affectedCountries.length === 0}
          >
            {loading ? '⏳ Calculating...' : '🎯 Apply Scenario'}
          </button>
        </form>
      </div>
      )}

      {data && (
        <div className="card-section">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Scenario Results</h3>

          <div className="grid cols-2">
            <div className="stat-box">
              <div className="stat-label">Original Total Enrollments</div>
              <div className="stat-value">{data.original_total?.toLocaleString()}</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Scenario Total Enrollments</div>
              <div className="stat-value">{data.scenario_total?.toLocaleString()}</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Total Reduction</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {data.total_reduction?.toLocaleString()}
              </div>
              <div className="stat-label">{data.reduction_percentage?.toFixed(1)}% reduction</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Affected Countries</div>
              <div className="stat-value">{affectedCountries.length}</div>
              <div className="stat-label">{affectedCountries.join(', ')}</div>
            </div>
          </div>
          </div>
        )}

          {baselineData && (
            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ marginBottom: '1rem' }}>Impact on Demand</h4>
              <div className="grid cols-2">
                <div className="stat-box">
                  <div className="stat-label">Baseline Total Demand</div>
                  <div className="stat-value">{baselineData.total_demand.toLocaleString()}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Estimated Scenario Demand</div>
                  <div className="stat-value">
                    {(baselineData.total_demand * (1 - data.reduction_percentage / 100)).toFixed(0)}
                  </div>
                  <div className="stat-label" style={{ color: 'var(--danger)' }}>
                    (approx. {data.reduction_percentage.toFixed(1)}% reduction)
                  </div>
                </div>
              </div>
            </div>
          )}

          {baselineData && (
            <button
              className="btn btn-secondary btn-large btn-block"
              onClick={onCompare}
              style={{ marginTop: '1.5rem' }}
              disabled={loading}
            >
              🔍 Compare with Baseline
            </button>
          )}
         {modelingTab === 'distribution' && (
          <div className="card-section">
            <EnrollmentDistribution />
          </div>
        )}

      {/* Simulator Tab Content */}
      {modelingTab === 'simulator' && (
        <Simulator
          trialSeq={trialSeq}
          onSimulate={handleSimulatorSubmit}
          loading={loading}
        />
      )}
    </div>
  );
}

export default ScenarioBuilder;
