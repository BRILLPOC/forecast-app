import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

function TrialSelector({ programSeq, onSelectTrial, onBack }) {
  const [trials, setTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTrials();
  }, [programSeq]);

  const fetchTrials = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (programSeq) {
        // Fetch trials for the selected program
        const data = await api.getTrialsByProgram(programSeq);
        setTrials(data);
      } else {
        // Fall back to all trials if no program is selected
        const data = await api.getTrials();
        setTrials(data);
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch trials:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrials = trials.filter(
    (trial) => {
      const trialId = trial.TRIAL_ID || trial.trial_id || '';
      const trialName = trial.TRIAL_NAME || trial.trial_name || '';
      const trialSeq = trial.TRIAL_SEQ || trial.trial_seq;
      const searchLower = searchTerm.toLowerCase();
      
      return (
        trialId.toLowerCase().includes(searchLower) ||
        trialName.toLowerCase().includes(searchLower) ||
        trialSeq?.toString().includes(searchTerm)
      );
    }
  );

  return (
    <div className="card elevated">
      <div className="card-header">
        <div className="header-with-back">
         
          <div>
            <h2>Select a Trial</h2>
            <p>Choose a clinical trial to analyze demand forecasting</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <span></span>
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
              placeholder="Search by trial ID, name, or sequence number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredTrials.length === 0 ? (
            <div className="alert alert-info">
              <span></span>
              <span>
                {trials.length === 0
                  ? 'No trials available for this program'
                  : 'No trials match your search'}
              </span>
            </div>
          ) : (
            <div className="grid cols-2">
              {filteredTrials.map((trial) => {
                const trialId = trial.TRIAL_ID || trial.trial_id;
                const trialSeq = trial.TRIAL_SEQ || trial.trial_seq;
                const trialName = trial.TRIAL_NAME || trial.trial_name;
                const description = trial.DESCRIPTION || trial.description;
                
                return (
                  <button
                    key={trialSeq}
                    className="trial-card"
                    onClick={() => onSelectTrial(trial)}
                  >
                    <div className="trial-id">{trialId}</div>
                    {trialName && <div className="trial-name">{trialName}</div>}
                    {description && <div className="trial-description">{description}</div>}
                    <div className="trial-seq">Seq: {trialSeq}</div>
                    <div className="trial-action">Select →</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style>{`
        .header-with-back {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .back-button {
          background: var(--gray-light);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-weight: 600;
          color: var(--text-primary);
          transition: all 0.2s;
          min-width: fit-content;
          margin-top: 0.25rem;
        }

        .back-button:hover {
          background: var(--primary-light);
          border-color: var(--primary);
          color: var(--primary);
        }

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

        .trial-name {
          font-size: 0.95rem;
          color: var(--text-primary);
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .trial-description {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
          line-height: 1.4;
          max-height: 3em;
          overflow: hidden;
          text-overflow: ellipsis;
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
