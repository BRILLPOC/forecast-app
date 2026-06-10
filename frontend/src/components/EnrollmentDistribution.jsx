import React, { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function getMonthRange(startValue, endValue) {
  if (!startValue || !endValue) return [];
  const [startYear, startMonth] = startValue.split('-').map(Number);
  const [endYear, endMonth] = endValue.split('-').map(Number);
  const startDate = new Date(startYear, startMonth - 1, 1);
  const endDate = new Date(endYear, endMonth - 1, 1);
  if (startDate > endDate) return [];

  const months = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    months.push({
      value: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function buildLinearDistribution(totalEnrollments, count) {
  if (count <= 0) return [];
  const base = Math.floor(totalEnrollments / count);
  const remainder = totalEnrollments - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function EnrollmentDistribution() {
  const currentYear = new Date().getFullYear();
  const [totalEnrollments, setTotalEnrollments] = useState(1200);
  const [distributionType, setDistributionType] = useState('Linear');
  const [startMonth, setStartMonth] = useState(`${currentYear}-01`);
  const [endMonth, setEndMonth] = useState(`${currentYear}-12`);
  const [viewMode, setViewMode] = useState('table');

  const months = useMemo(() => getMonthRange(startMonth, endMonth), [startMonth, endMonth]);
  const monthEnrollments = useMemo(() => {
    if (distributionType === 'Linear') {
      return buildLinearDistribution(Number(totalEnrollments) || 0, months.length);
    }
    return buildLinearDistribution(Number(totalEnrollments) || 0, months.length);
  }, [distributionType, totalEnrollments, months.length]);

  const totalDistributed = monthEnrollments.reduce((sum, value) => sum + value, 0);

  const invalidRange = Boolean(startMonth && endMonth && new Date(startMonth + '-01') > new Date(endMonth + '-01'));

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Enrollment Distribution</h2>
        <p>Build monthly enrollment plan from total target and date range</p>
      </div>

      <div className="card-section">
        <div className="form-row four" style={{ gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label htmlFor="total-enrollments">Total Plan Enrollments</label>
            <input
              id="total-enrollments"
              type="number"
              min="0"
              step="1"
              value={totalEnrollments}
              onChange={(e) => setTotalEnrollments(e.target.value ? Number(e.target.value) : 0)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="distribution-type">Distribution Type</label>
            <select
              id="distribution-type"
              value={distributionType}
              onChange={(e) => setDistributionType(e.target.value)}
            >
              <option value="Linear">Linear</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="start-month">Start Month</label>
            <input
              id="start-month"
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="end-month">End Month</label>
            <input
              id="end-month"
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </div>
        </div>

        {invalidRange && (
          <div className="alert alert-danger" style={{ marginTop: '1rem' }}>
            <span></span>
            <span>Start month must come before or equal to end month.</span>
          </div>
        )}

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
            <div>
              <h3>Distribution Summary</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {months.length} month{months.length === 1 ? '' : 's'} selected, {totalDistributed.toLocaleString()} enrollments assigned.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-outline ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table View
              </button>
              <button
                type="button"
                className={`btn btn-outline ${viewMode === 'chart' ? 'active' : ''}`}
                onClick={() => setViewMode('chart')}
              >
                Chart View
              </button>
            </div>
          </div>
        </div>

        {!invalidRange && months.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            {viewMode === 'table' ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Enrollments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((month, index) => (
                      <tr key={month.value}>
                        <td>{month.label}</td>
                        <td>{monthEnrollments[index].toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="summary-row">
                      <td><strong>Total</strong></td>
                      <td><strong>{totalDistributed.toLocaleString()}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="chart-container" style={{ minHeight: '360px' }}>
                <Plot
                  data={[
                    {
                      type: 'bar',
                      x: months.map((month) => month.label),
                      y: monthEnrollments,
                      marker: { color: '#0066cc' }
                    }
                  ]}
                  layout={{
                    autosize: true,
                    margin: { l: 60, r: 20, t: 40, b: 80 },
                    xaxis: { title: 'Month', tickangle: -45 },
                    yaxis: { title: 'Enrollments', rangemode: 'tozero' },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    showlegend: false
                  }}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EnrollmentDistribution;
