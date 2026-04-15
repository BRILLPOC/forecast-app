import React, { useState, useEffect } from 'react';
import * as api from '../services/api';

// Format month number to "Month Year" string (e.g., 1 -> "January 2025")
function formatMonth(monthNumber) {
  const baseDate = new Date(2025, 0, 1); // January 1, 2025
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const monthsOffset = monthNumber - 1; // Convert to 0-based
  const yearOffset = Math.floor(monthsOffset / 12);
  const monthIndex = monthsOffset % 12;
  
  const year = baseDate.getFullYear() + yearOffset;
  const monthName = months[monthIndex];
  
  return `${monthName} ${year}`;
}

function BaselineDemand({ trialSeq, data, onSubmit, loading }) {
  const [enrollVersion, setEnrollVersion] = useState('');
  const [dosageVersion, setDosageVersion] = useState('');
  const [enrollmentVersions, setEnrollmentVersions] = useState([]);
  const [dosingVersions, setDosingVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Fetch available versions when trial changes
  useEffect(() => {
    if (trialSeq) {
      fetchVersions();
    }
  }, [trialSeq]);

  // Reset selected item when data changes and set to first item
  useEffect(() => {
    if (data && data.by_item && Object.keys(data.by_item).length > 0) {
      setSelectedItem(Object.keys(data.by_item)[0]);
    }
  }, [data]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      trial_seq: trialSeq,
      enroll_version: enrollVersion ? parseInt(enrollVersion) : null,
      dosage_version: dosageVersion ? parseInt(dosageVersion) : null,
    });
  };

  // Helper function to get filtered data for selected item
  const getSelectedItemData = () => {
    if (!data || !selectedItem) return null;

    const itemDemand = data.by_item[selectedItem] || 0;
    const detailedByMonth = {};

    // If detailed records are available, calculate by_month for selected item
    if (data.detailed_records && data.detailed_records.length > 0) {
      data.detailed_records
        .filter(record => record.ITEM_ID === selectedItem)
        .forEach(record => {
          const monthFormatted = formatMonth(record.CONSUMPTION_MONTH);
          detailedByMonth[monthFormatted] = (detailedByMonth[monthFormatted] || 0) + (record.DEMAND_QTY || 0);
        });
    }

    return {
      item: selectedItem,
      demand: itemDemand,
      byMonth: detailedByMonth,
    };
  };

  const selectedItemData = getSelectedItemData();

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Baseline Demand Calculation</h2>
        <p>Calculate baseline demand based on enrollment and dosing data</p>
      </div>

      <div className="card-section">
        <form onSubmit={handleSubmit}>
          {versionsError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <span></span>
              <span>{versionsError}</span>
            </div>
          )}

          <div className="form-row two">
            <div className="form-group">
              <label htmlFor="enroll-version">Enrollment Version:</label>
              {versionsLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Loading versions...
                </div>
              ) : (
                <>
                  <select
                    id="enroll-version"
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
              <label htmlFor="dosage-version">Dosage Version:</label>
              {versionsLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Loading versions...
                </div>
              ) : (
                <>
                  <select
                    id="dosage-version"
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
            disabled={loading || versionsLoading}
          >
            {loading ? 'Calculating...' : 'Calculate Baseline Demand'}
          </button>
        </form>
      </div>

      {data && !loading && (
        <div className="card-section">
          {/* Items Tab Navigation */}
          {data.by_item && Object.keys(data.by_item).length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Items Used in Trial</h3>
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                flexWrap: 'wrap',
                borderBottom: '2px solid var(--border-color)',
                paddingBottom: '1rem'
              }}>
                {Object.keys(data.by_item).map((item) => (
                  <button
                    key={item}
                    onClick={() => setSelectedItem(item)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      borderRadius: '4px 4px 0 0',
                      border: 'none',
                      backgroundColor: selectedItem === item ? 'var(--primary)' : 'var(--bg-secondary)',
                      color: selectedItem === item ? 'white' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: selectedItem === item ? '600' : '500',
                      transition: 'all 0.2s ease',
                    }}
                    className={selectedItem === item ? 'btn-active' : ''}
                  >
                    {item}
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}>
                      ({data.by_item[item].toLocaleString()})
                    </span>
                  </button>
                ))}
              </div>
              {selectedItem && (
                <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                  <small style={{ color: 'var(--text-secondary)' }}>
                    Selected Item: <strong>{selectedItem}</strong> - Total Demand: <strong>{data.by_item[selectedItem].toLocaleString()} units</strong>
                  </small>
                </div>
              )}
            </div>
          )}

          <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>Results Summary</h3>

          <div className="grid cols-2">
            <div className="stat-box">
              <div className="stat-label">Total Demand Quantity</div>
              <div className="stat-value">{data.total_demand.toLocaleString()}</div>
              <div className="stat-label">units</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Planned Subjects</div>
              <div className="stat-value">{data.total_planned_subjects.toLocaleString()}</div>
              <div className="stat-label">planned enrollment</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Actual Subjects</div>
              <div className="stat-value">{data.total_actual_subjects.toLocaleString()}</div>
              <div className="stat-label">actual enrollment</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Peak Month</div>
              <div className="stat-value">{data.peak_month}</div>
              <div className="stat-label">Highest demand</div>
            </div>

            <div className="stat-box">
              <div className="stat-label">Peak Demand</div>
              <div className="stat-value">{data.peak_demand.toLocaleString()}</div>
              <div className="stat-label">units</div>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ marginBottom: '1rem' }}>Demand by Country {selectedItem && `- ${selectedItem}`}</h4>
            <div className="grid cols-3">
              {selectedItem && data.detailed_records && data.detailed_records.length > 0 ? (
                // Show filtered data for selected item
                Object.entries(
                  data.detailed_records
                    .filter(record => record.ITEM_ID === selectedItem)
                    .reduce((acc, record) => {
                      const country = record.COUNTRY;
                      acc[country] = (acc[country] || 0) + (record.DEMAND_QTY || 0);
                      return acc;
                    }, {})
                ).map(([country, demand]) => (
                  <div key={country} className="stat-box">
                    <div className="stat-label">{country}</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                      {demand.toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                // Show all countries if detailed records not available
                Object.entries(data.by_country).map(([country, demand]) => (
                  <div key={country} className="stat-box">
                    <div className="stat-label">{country}</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                      {demand.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
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
              <h4 style={{ marginBottom: '1rem' }}>
                Demand by Month {selectedItem && `- ${selectedItem}`}
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Demand (units)</th>
                      <th>% of {selectedItem ? `${selectedItem}` : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItemData && Object.keys(selectedItemData.byMonth).length > 0 ? (
                      // Show filtered data for selected item
                      Object.entries(selectedItemData.byMonth)
                        .map(([month, demand]) => (
                          <tr key={month}>
                            <td>{month}</td>
                            <td>{demand.toLocaleString()}</td>
                            <td>{((demand / selectedItemData.demand) * 100).toFixed(1)}%</td>
                          </tr>
                        ))
                    ) : (
                      // Show all items data if detailed records not available
                      Object.entries(data.by_month)
                        .map(([month, demand]) => (
                          <tr key={month}>
                            <td>{month}</td>
                            <td>{demand.toLocaleString()}</td>
                            <td>{((demand / data.total_demand) * 100).toFixed(1)}%</td>
                          </tr>
                        ))
                    )}
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
