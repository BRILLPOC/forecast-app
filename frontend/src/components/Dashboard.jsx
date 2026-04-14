import React, { useState, useEffect } from 'react';
import * as api from '../services/api';
import ProgramSelector from './ProgramSelector';
import TrialSelector from './TrialSelector';
import BaselineDemand from './BaselineDemand';
import '../styles/index.css';

function Dashboard() {
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [baselineData, setBaselineData] = useState(null);
  const [scenarioData, setScenarioData] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('baseline');

  const handleProgramSelect = (program) => {
    setSelectedProgram(program);
    setSelectedTrial(null); // Reset trial selection when program changes
    setBaselineData(null);
    setScenarioData(null);
    setComparisonData(null);
  };

  const handleTrialSelect = (trial) => {
    setSelectedTrial(trial);
    setBaselineData(null);
    setScenarioData(null);
    setComparisonData(null);
    setActiveTab('baseline');
  };

  const handleBackToPrograms = () => {
    setSelectedProgram(null);
    setSelectedTrial(null);
    setBaselineData(null);
    setScenarioData(null);
    setComparisonData(null);
  };

  const handleBackToTrials = () => {
    setSelectedTrial(null);
    setBaselineData(null);
    setScenarioData(null);
    setComparisonData(null);
    setActiveTab('baseline');
  };

  const handleBaselineDemandSubmit = async (params) => {
    setLoading(true);
    setError(null);
    try {
      const trialSeq = selectedTrial.TRIAL_SEQ || selectedTrial.trial_seq;
      const result = await api.calculateBaselineDemand(
        trialSeq,
        params.enroll_version,
        params.dosage_version,
        true
      );
      setBaselineData(result);
      setActiveTab('baseline');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScenarioSubmit = async (params) => {
    setLoading(true);
    setError(null);
    try {
      const trialSeq = selectedTrial.TRIAL_SEQ || selectedTrial.trial_seq;
      const result = await api.applyScenario(
        trialSeq,
        params.scenario_name,
        params.affected_countries,
        params.reduction_factor,
        params.start_month,
        params.enroll_version,
        params.dosage_version,
        true
      );
      setScenarioData(result);
      setActiveTab('scenario');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!baselineData || !scenarioData) {
      setError('Please calculate both baseline and scenario data first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const trialSeq = selectedTrial.TRIAL_SEQ || selectedTrial.trial_seq;
      const result = await api.compareScenario(
        { trial_seq: trialSeq },
        { trial_seq: trialSeq }
      );
      setComparisonData(result);
      setActiveTab('comparison');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTrialDisplay = () => {
    const trial = selectedTrial;
    return trial.TRIAL_ID || trial.trial_id || 'Unknown Trial';
  };

  const getProgramDisplay = () => {
    const program = selectedProgram;
    return program.program_name || program.program_id || 'Unknown Program';
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Clinical Supply Forecast</h1>
        <p>Demand Forecasting & Scenario Analysis System</p>
      </header>

      <div className="app-content">
        {error && (
          <div className="alert alert-danger">
            <span>⚠️</span>
            <div>
              <strong>Error:</strong> {error}
              <button
                className="btn btn-small"
                onClick={() => setError(null)}
                style={{ marginLeft: '1rem' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <span>Processing...</span>
          </div>
        )}

        {/* STEP 1: Program Selection */}
        {!selectedProgram ? (
          <ProgramSelector onSelectProgram={handleProgramSelect} />
        ) : !selectedTrial ? (
          // STEP 2: Trial Selection (filtered by program)
          <div>
            <div className="card">
              <div className="card-header">
                <h2>Program: {getProgramDisplay()}</h2>
                <button
                  className="btn btn-outline btn-small"
                  onClick={handleBackToPrograms}
                >
                  ← Back to Programs
                </button>
              </div>
            </div>
            <TrialSelector 
              programSeq={selectedProgram.program_seq} 
              onSelectTrial={handleTrialSelect}
              onBack={handleBackToPrograms}
            />
          </div>
        ) : (
          // STEP 3: Trial Analysis
          <div>
            <div className="card">
              <div className="card-header breadcrumb-header">
                <div className="breadcrumb">
                  <button
                    className="breadcrumb-btn"
                    onClick={handleBackToPrograms}
                  >
                    {getProgramDisplay()}
                  </button>
                  <span className="breadcrumb-separator">→</span>
                  <span className="breadcrumb-current">
                    Trial: {getTrialDisplay()}
                  </span>
                </div>
                <button
                  className="btn btn-outline btn-small"
                  onClick={handleBackToTrials}
                >
                  ← Change Trial
                </button>
              </div>
            </div>

            <div className="tabs" style={{ marginBottom: '1.5rem' }}>
              <button
                className={`tab-btn ${activeTab === 'baseline' ? 'active' : ''}`}
                onClick={() => setActiveTab('baseline')}
              >
                Baseline Demand
              </button>
              <button
                className={`tab-btn ${activeTab === 'scenario' ? 'active' : ''}`}
                onClick={() => setActiveTab('scenario')}
              >
                Scenario Modeling
              </button>
              {/* <button
                className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
                onClick={() => setActiveTab('comparison')}
              >
                Comparison Analysis
              </button>
              <button
                className={`tab-btn ${activeTab === 'charts' ? 'active' : ''}`}
                onClick={() => setActiveTab('charts')}
              >
                Visualizations
              </button> */}
            </div>

            {activeTab === 'baseline' && (
              <BaselineDemand
                trialSeq={selectedTrial.TRIAL_SEQ || selectedTrial.trial_seq}
                data={baselineData}
                onSubmit={handleBaselineDemandSubmit}
                loading={loading}
              />
            )}

            {activeTab === 'scenario' && (
              <ScenarioBuilder
                trialSeq={selectedTrial.TRIAL_SEQ || selectedTrial.trial_seq}
                baselineData={baselineData}
                data={scenarioData}
                onSubmit={handleScenarioSubmit}
                onCompare={handleCompare}
                loading={loading}
              />
            )}

            {activeTab === 'comparison' && (
              <ComparisonAnalysis
                baselineData={baselineData}
                scenarioData={scenarioData}
                comparisonData={comparisonData}
                onBack={() => setActiveTab('baseline')}
              />
            )}

            {activeTab === 'charts' && (
              <DemandCharts
                baselineData={baselineData}
                scenarioData={scenarioData}
                comparisonData={comparisonData}
              />
            )}
          </div>
        )}
      </div>

      <style>{`
        .tabs {
          display: flex;
          gap: 0.5rem;
          border-bottom: 2px solid var(--border-color);
        }

        .tab-btn {
          padding: 0.75rem 1.5rem;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 1rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          color: var(--primary);
        }

        .tab-btn.active {
          border-bottom-color: var(--primary);
          color: var(--primary);
        }

        .breadcrumb-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          flex: 1;
        }

        .breadcrumb-btn {
          background: none;
          border: none;
          color: var(--primary);
          cursor: pointer;
          text-decoration: underline;
          font-size: 1rem;
          padding: 0;
        }

        .breadcrumb-btn:hover {
          color: var(--primary-dark);
        }

        .breadcrumb-separator {
          color: var(--text-secondary);
          margin: 0 0.5rem;
        }

        .breadcrumb-current {
          color: var(--text-primary);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

export default Dashboard;
