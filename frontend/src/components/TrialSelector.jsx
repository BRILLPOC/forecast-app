import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

function TrialSelector({ onSelectTrial }) {
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTrials();
  }, []);

  const fetchTrials = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTrials();
      setTrials(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch trials:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrials = trials.filter(
    (trial) =>
      trial.TRIAL_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trial.TRIAL_SEQ.toString().includes(searchTerm)
  );

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Select a Trial</h2>
        <p>Choose a clinical trial to analyze demand forecasting</p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading trials...</span>
        </div>
      ) : (
        <div className="card-section">
          <div className="form-group">
            <label htmlFor="search">Search Trials:</label>
            <input
              id="search"
              type="text"
              placeholder="Search by trial ID or sequence number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredTrials.length === 0 ? (
            <div className="alert alert-info">
              <span>
                {trials.length === 0
                  ? 'No trials available'
                  : 'No trials match your search'}
              </span>
            </div>
          ) : (
            <div className="grid cols-2">
              {filteredTrials.map((trial) => (
                <button
                  key={trial.TRIAL_SEQ}
                  className="trial-card"
                  onClick={() => onSelectTrial(trial)}
                >
                  <div className="trial-id">{trial.TRIAL_ID}</div>
                  <div className="trial-seq">Sequence: {trial.TRIAL_SEQ}</div>
                  <div className="trial-action">Select →</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .trial-card {
          background: white;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          padding: 1.5rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.3s;
          display: block;
        }

        .trial-card:hover {
          border-color: var(--primary);
          box-shadow: var(--shadow-lg);
          transform: translateY(-2px);
        }

        .trial-id {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }

        .trial-seq {
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin-bottom: 1rem;
        }

        .trial-action {
          color: var(--primary);
          font-weight: 600;
          font-size: 0.95rem;
        }
      `}</style>
    </div>
  );
}

export default TrialSelector;
