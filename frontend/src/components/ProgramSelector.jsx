import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

function ProgramSelector({ onSelectProgram }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPrograms();
  }, []);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPrograms();
      setPrograms(data);
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch programs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPrograms = programs.filter(
    (program) =>
      program.program_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (program.program_name && program.program_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      program.program_seq.toString().includes(searchTerm)
  );

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Select a Program</h2>
        <p>Choose a clinical program to view related trials</p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading programs...</span>
        </div>
      ) : (
        <div className="card-section">
          <div className="form-group">
            <label htmlFor="search">Search Programs:</label>
            <input
              id="search"
              type="text"
              placeholder="Search by program ID or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredPrograms.length === 0 ? (
            <div className="alert alert-info">
              <span>ℹ️</span>
              <span>
                {programs.length === 0
                  ? 'No programs available'
                  : 'No programs match your search'}
              </span>
            </div>
          ) : (
            <div className="grid cols-2">
              {filteredPrograms.map((program) => (
                <button
                  key={program.program_seq}
                  className="program-card"
                  onClick={() => onSelectProgram(program)}
                >
                  <div className="card-content">
                    <div className="card-title">{program.program_id}</div>
                    {program.program_name && (
                      <div className="card-subtitle">{program.program_name}</div>
                    )}
                    <div className="card-meta">
                      <span className="badge">
                        {program.trial_count || 0} trial{program.trial_count !== 1 ? 's' : ''}
                      </span>
                      {program.status && (
                        <span className={`status-badge status-${program.status.toLowerCase()}`}>
                          {program.status}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProgramSelector;
