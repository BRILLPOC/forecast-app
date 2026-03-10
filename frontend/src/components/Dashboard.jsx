import React, { useState, useEffect } from 'react';
import * as api from '../services/api';
import TrialSelector from './TrialSelector';
import BaselineDemand from './BaselineDemand';

import '../styles/index.css';

function Dashboard() {
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [baselineData, setBaselineData] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('baseline');

  const handleTrialSelect = (trial) => {
    setSelectedTrial(trial);
    setBaselineData(null);
    setScenarioData(null);
    setComparisonData(null);
    setActiveTab('baseline');
  };

  const handleBaselineDemandSubmit = async (params) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.calculateBaselineDemand(
        params.trial_seq,
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

  

  return (
    <div className="app">
      <header className="app-header">
        <h1>Clinical Supply Forecast</h1>
        <p>Demand Forecasting & Scenario Analysis System</p>
      </header>

      <div className="app-content">
        {error && (
          <div className="alert alert-danger">
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

        {!selectedTrial ? (
          <TrialSelector onSelectTrial={handleTrialSelect} />
        ) : (
          <div>
            <div className="card">
              <div className="card-header">
                <h2>Trial: {selectedTrial.TRIAL_ID}</h2>
                <button
                  className="btn btn-outline btn-small"
                  onClick={() => handleTrialSelect(null)}
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
             
            </div>

            {activeTab === 'baseline' && (
              <BaselineDemand
                trialSeq={selectedTrial.TRIAL_SEQ}
                data={baselineData}
                onSubmit={handleBaselineDemandSubmit}
                loading={loading}
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
      `}</style>
    </div>
  );
}

export default Dashboard;
