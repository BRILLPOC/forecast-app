import React, { useState } from 'react';

function BaselineDemand({ trialSeq, data, onSubmit, loading }) {
  const [enrollVersion, setEnrollVersion] = useState('');
  const [dosageVersion, setDosageVersion] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      trial_seq: trialSeq,
      enroll_version: enrollVersion ? parseInt(enrollVersion) : null,
      dosage_version: dosageVersion ? parseInt(dosageVersion) : null,
    });
  };

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Baseline Demand Calculation</h2>
        <p>Calculate baseline demand based on enrollment and dosing data</p>
      </div>

      <div className="card-section">
        <form onSubmit={handleSubmit}>
          <div className="form-row two">
            <div className="form-group">
              <label htmlFor="enroll-version">Enrollment Version (optional):</label>
              <input
                id="enroll-version"
                type="number"
                placeholder="Leave blank for latest version"
                value={enrollVersion}
                onChange={(e) => setEnrollVersion(e.target.value)}
                disabled={loading}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Leave blank to use the latest available version
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="dosage-version">Dosage Version (optional):</label>
              <input
                id="dosage-version"
                type="number"
                placeholder="Leave blank for latest version"
                value={dosageVersion}
                onChange={(e) => setDosageVersion(e.target.value)}
                disabled={loading}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
                Leave blank to use the latest available version
              </small>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-large btn-block"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Calculate Baseline Demand'}
          </button>
        </form>
      </div>

      {data && (
        <div className="card-section">
          <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Results Summary</h3>

          <div className="grid cols-2">
            <div className="stat-box">
              <div className="stat-label">Total Demand Quantity</div>
              <div className="stat-value">{data.total_demand.toLocaleString()}</div>
              <div className="stat-label">units</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Total Patients</div>
              <div className="stat-value">{data.total_patients.toLocaleString()}</div>
              <div className="stat-label">enrolled</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Peak Month</div>
              <div className="stat-value">{data.peak_month}</div>
              <div className="stat-label">Month {data.peak_month}</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Peak Demand</div>
              <div className="stat-value">{data.peak_demand.toLocaleString()}</div>
              <div className="stat-label">units</div>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Demand by Country</h4>
            <div className="grid cols-3">
              {Object.entries(data.by_country).map(([country, demand]) => (
                <div key={country} className="stat-box">
                  <div className="stat-label">{country}</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {demand.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Demand by Item</h4>
            <div className="grid cols-3">
              {Object.entries(data.by_item).slice(0, 6).map(([item, demand]) => (
                <div key={item} className="stat-box">
                  <div className="stat-label">{item}</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {demand.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {Object.entries(data.by_month).length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ marginBottom: '1rem' }}>Demand by Month</h4>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Demand (units)</th>
                      <th>% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.by_month)
                      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                      .map(([month, demand]) => (
                        <tr key={month}>
                          <td>Month {month}</td>
                          <td>{demand.toLocaleString()}</td>
                          <td>{((demand / data.total_demand) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BaselineDemand;
