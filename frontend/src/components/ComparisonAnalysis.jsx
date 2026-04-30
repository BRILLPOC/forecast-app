import React from 'react';

function ComparisonAnalysis({ baselineData, scenarioData, comparisonData, onBack }) {
  if (!baselineData || !scenarioData) {
    return (
      <div className="card elevated">
        <div className="card-header">
          <h2>Comparison Analysis</h2>
        </div>
        <div className="alert alert-info">
          <span></span>
          <span>Please calculate both baseline and scenario first</span>
        </div>
        <button className="btn btn-outline" onClick={onBack}>
          ← Back
        </button>
      </div>
    );
  }

  const baselineDemand = baselineData.total_demand;
  const scenarioDemand = baselineData.total_demand * (1 - scenarioData.reduction_percentage / 100);
  const demandReduction = baselineDemand - scenarioDemand;
  const demandReductionPercent = (demandReduction / baselineDemand) * 100;

  return (
    <div className="card elevated">
      <div className="card-header">
        <h2>Baseline vs Scenario Comparison</h2>
        <p>Analyze the impact of scenario changes on demand</p>
      </div>

      <div className="card-section">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
          Overall Impact
        </h3>

        <div className="grid cols-2">
          <div className="stat-box">
            <div className="stat-label">Baseline Demand</div>
            <div className="stat-value">{baselineDemand.toLocaleString()}</div>
            <div className="stat-label">units</div>
          </div>

          <div className="stat-box">
            <div className="stat-label">Scenario Demand</div>
            <div className="stat-value">{scenarioDemand.toFixed(0)}</div>
            <div className="stat-label">units</div>
          </div>

          <div className="stat-box">
            <div className="stat-label">Demand Reduction</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {demandReduction.toFixed(0)}
            </div>
            <div className="stat-label">{demandReductionPercent.toFixed(1)}% reduction</div>
          </div>

          <div className="stat-box">
            <div className="stat-label">Cost Impact</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              ~${(demandReduction * 100).toLocaleString()}
            </div>
            <div className="stat-label">estimated savings</div>
          </div>
        </div>
      </div>

      <div className="card-section">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
          Monthly Impact
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Baseline</th>
                <th>Scenario</th>
                <th>Change</th>
                <th>% Change</th>
              </tr>
            </thead>
            <tbody>
              {baselineData.by_month && Object.entries(baselineData.by_month)
                .map(([month, baseline]) => {
                  const scenario = baseline * (1 - scenarioData.reduction_percentage / 100);
                  const change = scenario - baseline;
                  const pctChange = (change / baseline) * 100;
                  return (
                    <tr key={month}>
                      <td>{month}</td>
                      <td>{baseline.toLocaleString()}</td>
                      <td>{scenario.toFixed(0)}</td>
                      <td style={{ color: change < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {change > 0 ? '+' : ''}{change.toFixed(0)}
                      </td>
                      <td style={{ color: pctChange < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-section">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
          Country Impact
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Baseline</th>
                <th>Scenario</th>
                <th>Impact</th>
                <th>% Change</th>
              </tr>
            </thead>
            <tbody>
              {baselineData.by_country && Object.entries(baselineData.by_country).map(
                ([country, baseline]) => {
                  const reduction = scenarioData.reduction_percentage / 100;
                  const scenario = baseline * (1 - reduction);
                  const change = scenario - baseline;
                  const pctChange = (change / baseline) * 100;
                  return (
                    <tr key={country}>
                      <td>{country}</td>
                      <td>{baseline.toLocaleString()}</td>
                      <td>{scenario.toFixed(0)}</td>
                      <td style={{ color: change < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {change > 0 ? '+' : ''}{change.toFixed(0)}
                      </td>
                      <td style={{ color: pctChange < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-section">
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
          Key Performance Indicators
        </h3>

        <div className="grid cols-3">
          <div className="stat-box">
            <div className="stat-label">Enrollment Reduction</div>
            <div className="stat-value">
              {scenarioData.reduction_percentage.toFixed(1)}%
            </div>
            <div className="stat-label">{scenarioData.total_reduction.toLocaleString()} subjects</div>
          </div>

          <div className="stat-box">
            <div className="stat-label">Supply Chain Impact</div>
            <div className="stat-value">
              {((demandReduction / baselineDemand) * 100).toFixed(1)}%
            </div>
            <div className="stat-label">reduction in units</div>
          </div>

          <div className="stat-box">
            <div className="stat-label">Resilience Score</div>
            <div className="stat-value">
              {(100 - demandReductionPercent).toFixed(1)}%
            </div>
            <div className="stat-label">of baseline maintained</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button className="btn btn-outline btn-large btn-block" onClick={onBack}>
          ← Back to Scenarios
        </button>
      </div>
    </div>
  );
}

export default ComparisonAnalysis;
