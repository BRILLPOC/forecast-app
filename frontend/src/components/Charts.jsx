import React, { useState, useMemo } from 'react';
import Plot from 'react-plotly.js';

// ISO Country Code mapping for Geographic map
const COUNTRY_ISO_MAP = {
  'USA': 'USA',
  'US': 'USA',
  'GERMANY': 'DEU',
  'DE': 'DEU',
  'CHINA': 'CHN',
  'CN': 'CHN',
  'SPAIN': 'ESP',
  'ES': 'ESP',
  'FRANCE': 'FRA',
  'FR': 'FRA',
  'BRAZIL': 'BRA',
  'BR': 'BRA',
  'ITALY': 'ITA',
  'IT': 'ITA',
  'UK': 'GBR',
  'GB': 'GBR',
  'CANADA': 'CAN',
  'CA': 'CAN',
  'AUSTRALIA': 'AUS',
  'AU': 'AUS',
  'JAPAN': 'JPN',
  'JP': 'JPN',
  'GERMANY (DE)': 'DEU',
  'FRANCE (FR)': 'FRA',
  'ITALY (IT)': 'ITA',
  'SPAIN (ES)': 'ESP',
  'UK (GB)': 'GBR',
  'CANADA (CA)': 'CAN',
  'USA (US)': 'USA',
  'AUSTRALIA (AU)': 'AUS'
};

const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DemandCharts({ baselineData }) {
  const [activeSubTab, setActiveSubTab] = useState('enrollment'); // 'enrollment', 'site-country', 'supply'

  // Sliders/User Input State to make dashboard dynamic
  const [enrollmentLag, setEnrollmentLag] = useState(-15);        // % lag of actuals vs planned
  const [velocityModifier, setVelocityModifier] = useState(0);    // % mod to weekly velocity/rates
  const [leadTimeDelta, setLeadTimeDelta] = useState(0);          // shift lead time in days
  const [discontinuationMod, setDiscontinuationMod] = useState(0); // % mod to discontinuations

  if (!baselineData) {
    return (
      <div className="card elevated">
        <div className="card-header">
          <h2>Analytics & Visualizations</h2>
        </div>
        <div className="alert alert-info">
          <span>ℹ️</span>
          <span>Please calculate baseline demand first to view interactive analytics dashboard.</span>
        </div>
      </div>
    );
  }

  // ============================================================
  // DATA PREPARATION & DERIVATIONS (DYNAMIC BASED ON STATE)
  // ============================================================
  const months = useMemo(() => Object.keys(baselineData.by_month), [baselineData]);

  // Forecast Demand by month (from baseline)
  const forecastDemand = useMemo(() => {
    return months.map(m => baselineData.by_month[m] || 0);
  }, [months, baselineData]);

  // Actual Demand (calculated dynamically from enrollmentLag slider)
  const actualDemand = useMemo(() => {
    return forecastDemand.map((val, idx) => {
      const lagFactor = 1 + (enrollmentLag / 100);
      // Add slight sin/cos variation to keep curves natural but following the slider
      const factor = Math.max(0, lagFactor + (Math.sin(idx) * 0.03));
      return Math.round(val * factor);
    });
  }, [forecastDemand, enrollmentLag]);

  // Cumulative Curves
  const cumulativeForecast = useMemo(() => {
    let sum = 0;
    return forecastDemand.map(val => sum += val);
  }, [forecastDemand]);

  const cumulativeActual = useMemo(() => {
    let sum = 0;
    return actualDemand.map(val => sum += val);
  }, [actualDemand]);

  // Variance calculations
  const monthlyVariances = useMemo(() => {
    return forecastDemand.map((fc, idx) => {
      const act = actualDemand[idx];
      if (fc === 0) return 0;
      return Math.round(((act - fc) / fc) * 100);
    });
  }, [forecastDemand, actualDemand]);

  // Country contribution data
  const countryContribution = useMemo(() => {
    const countries = Object.keys(baselineData.by_country || {});
    const values = countries.map(c => baselineData.by_country[c]);
    const total = values.reduce((s, v) => s + v, 0);
    const lagFactor = 1 + (enrollmentLag / 100);
    
    const actualValues = values.map(val => Math.round(val * lagFactor));
    const avgActual = actualValues.length > 0 
      ? actualValues.reduce((s, v) => s + v, 0) / actualValues.length 
      : 1;

    return countries.map((c, i) => {
      const planned = values[i];
      const actual = actualValues[i];
      
      // Dynamic spread: 3 = High, 2 = Medium, 1 = Low, 0 = None
      let mapLevel = 0;
      let levelName = 'None';
      if (actual > 0) {
        const ratio = actual / avgActual;
        if (ratio >= 1.2) {
          mapLevel = 3;
          levelName = 'High';
        } else if (ratio >= 0.4) {
          mapLevel = 2;
          levelName = 'Medium';
        } else {
          mapLevel = 1;
          levelName = 'Low';
        }
      }

      return {
        country: c,
        value: planned,
        actual: actual,
        percentage: total > 0 ? ((planned / total) * 100).toFixed(0) : 0,
        iso: COUNTRY_ISO_MAP[c.toUpperCase()] || 'USA',
        mapLevel,
        levelName
      };
    });
  }, [baselineData, enrollmentLag]);

  // Site Performance Heatmap (dynamically reacts to enrollmentLag and discontinuationMod)
  const siteData = useMemo(() => {
    const baselineTotal = baselineData.total_planned_subjects || 1200;
    const lagFactor = 1 + (enrollmentLag / 100);
    const discFactor = 1 + (discontinuationMod / 100);

    return [
      { id: 'Site 101', actual: Math.round(baselineTotal * 0.10 * lagFactor), pctOfTotal: 12, vsTarget: Math.round(108 * lagFactor), risk: discFactor > 1.2 ? 'Medium' : 'Low', class: discFactor > 1.2 ? 'status-pending' : 'status-active' },
      { id: 'Site 102', actual: Math.round(baselineTotal * 0.08 * lagFactor), pctOfTotal: 10, vsTarget: Math.round(89 * lagFactor), risk: 'Medium', class: 'status-pending' },
      { id: 'Site 103', actual: Math.round(baselineTotal * 0.07 * lagFactor), pctOfTotal: 8, vsTarget: Math.round(68 * lagFactor), risk: discFactor > 0.9 ? 'High' : 'Medium', class: discFactor > 0.9 ? 'status-paused' : 'status-pending' },
      { id: 'Site 104', actual: Math.round(baselineTotal * 0.05 * lagFactor), pctOfTotal: 6, vsTarget: Math.round(55 * lagFactor), risk: 'High', class: 'status-paused' },
      { id: 'Site 105', actual: Math.round(baselineTotal * 0.04 * lagFactor), pctOfTotal: 5, vsTarget: Math.round(41 * lagFactor), risk: 'High', class: 'status-paused' },
      { id: 'Site 106', actual: Math.round(baselineTotal * 0.03 * lagFactor), pctOfTotal: 4, vsTarget: Math.round(32 * lagFactor), risk: 'High', class: 'status-paused' },
      { id: 'Site 107', actual: Math.round(baselineTotal * 0.02 * lagFactor), pctOfTotal: 2, vsTarget: Math.round(18 * lagFactor), risk: 'High', class: 'status-paused' },
      { id: 'Site 108', actual: Math.round(baselineTotal * 0.01 * lagFactor), pctOfTotal: 1, vsTarget: Math.round(14 * lagFactor), risk: 'High', class: 'status-paused' },
    ];
  }, [baselineData, enrollmentLag, discontinuationMod]);

  // Site Risk Scatter/Bubble data (dynamically reacts to velocityModifier and discontinuationMod)
  const bubbleChartData = useMemo(() => {
    const baseEnrollments = [48, 72, 110, 140, 205, 52, 98, 125, 222, 160];
    const baseDiscontinuation = [19, 16, 8, 14, 7, 21, 10, 5, 15, 20];
    const baseSize = [60, 90, 120, 75, 190, 45, 110, 85, 220, 130];

    const vMod = 1 + (velocityModifier / 100);
    const dMod = 1 + (discontinuationMod / 100);

    const x = baseEnrollments.map(e => Math.round(e * vMod));
    const y = baseDiscontinuation.map(d => Math.min(100, Math.max(0, Math.round(d * dMod))));
    const size = baseSize.map(s => Math.round(s * vMod));

    const colors = y.map(rate => {
      if (rate >= 18) return '#cc0000'; // High Risk
      if (rate >= 12) return '#ff8800'; // Medium Risk
      return '#00aa44'; // Low Risk
    });

    const text = y.map((rate, idx) => {
      const site = 101 + idx;
      if (rate >= 18) return `Site ${site} (High: ${rate}% discontinuation)`;
      if (rate >= 12) return `Site ${site} (Medium: ${rate}% discontinuation)`;
      return `Site ${site} (Low: ${rate}% discontinuation)`;
    });

    return { x, y, size, color: colors, text };
  }, [velocityModifier, discontinuationMod]);

  // Supply Lead Time change metrics (dynamically reacts to leadTimeDelta)
  const leadTimeTrend = useMemo(() => {
    const monthsRange = MONTH_SHORT_NAMES.slice(0, months.length || 12);
    const baseLeadTime = [22, 24, 30, 32, 34, 39, 41, 46, 51, 54, 58, 62].slice(0, monthsRange.length);

    return {
      x: monthsRange,
      leadTimeDays: baseLeadTime.map(d => Math.max(5, d + leadTimeDelta)),
      // Formula: Demand Impact % = (New Lead Time - Old Lead Time) / Old Lead Time * 100
      // Since New Lead Time - Old Lead Time = leadTimeDelta, the formula is: (leadTimeDelta / baseLeadTime) * 100
      demandImpactPct: baseLeadTime.map(oldLt => {
        const pctChange = (leadTimeDelta / oldLt) * 100;
        return parseFloat(pctChange.toFixed(1));
      })
    };
  }, [months, leadTimeDelta]);

  const avgDemandImpact = useMemo(() => {
    const avgBaseLeadTime = 32;
    const impact = (leadTimeDelta / avgBaseLeadTime) * 100;
    return parseFloat(impact.toFixed(1));
  }, [leadTimeDelta]);

  // Weekly rates (reacts to velocityModifier and discontinuationMod)
  const weeklyRates = useMemo(() => {
    const weeks = Array.from({ length: 24 }, (_, i) => `Wk ${i + 1}`);
    const vMod = 1 + (velocityModifier / 100);
    const dMod = 1 + (discontinuationMod / 100);

    return {
      x: weeks,
      enrollment: Array.from({ length: 24 }, (_, i) => Math.max(0, Math.round((27.4 + Math.sin(i) * 5 + Math.random() * 2) * vMod))),
      randomization: Array.from({ length: 24 }, (_, i) => Math.max(0, Math.round((18.6 + Math.cos(i) * 3 + Math.random() * 1) * vMod))),
      discontinuation: Array.from({ length: 24 }, (_, i) => Math.max(0, Math.round((6.2 + Math.sin(i * 0.5) * 2 + Math.random() * 0.5) * dMod)))
    };
  }, [velocityModifier, discontinuationMod]);

  // ============================================================
  // CHART CONFIGURATIONS (WITH EXPLICIT HEIGHTS & MARGINS TO PREVENT OVERLAPPING)
  // ============================================================
  const themeFont = { family: 'inherit', color: '#333' };

  // Common Layout adjustments for clean visual presentation
  const defaultLayout = {
    height: 380,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: themeFont,
    autosize: true,
    showlegend: true,
    legend: {
      orientation: 'h',
      y: 1.08,
      x: 0.5,
      xanchor: 'center',
      yanchor: 'bottom'
    }
  };

  const chartStyles = {
    // 1. Actual vs Forecast line chart
    actualVsForecast: {
      data: [
        {
          x: months,
          y: forecastDemand,
          mode: 'lines+markers',
          name: 'Forecast Enrollment',
          line: { color: '#0066cc', width: 3, dash: 'dash' },
          marker: { size: 6, color: '#0066cc' }
        },
        {
          x: months,
          y: actualDemand,
          mode: 'lines+markers',
          name: 'Actual Enrollment',
          line: { color: '#00aa44', width: 3 },
          marker: { size: 6, color: '#00aa44' }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '1. Enrollment Trend (Actual vs Forecast)', font: { size: 14, weight: 'bold' } },
        margin: { l: 60, r: 30, t: 85, b: 60 },
        xaxis: { gridcolor: '#f0f0f0' },
        yaxis: { title: 'Subjects', gridcolor: '#f0f0f0', rangemode: 'tozero' },
        annotations: [
          {
            x: months[Math.floor(months.length / 2)] || '',
            y: forecastDemand[Math.floor(months.length / 2)] || 0,
            text: enrollmentLag < 0
              ? `We are ${Math.abs(enrollmentLag)}% behind<br>forecast`
              : enrollmentLag > 0
                ? `We are ${enrollmentLag}% ahead<br>of forecast`
                : 'Enrollment matches forecast',
            showarrow: true,
            arrowhead: 2,
            ax: 40,
            ay: 45,
            bgcolor: '#ffffff',
            bordercolor: enrollmentLag < 0 ? '#cc0000' : enrollmentLag > 0 ? '#00aa44' : '#666666',
            borderwidth: 1.5,
            borderpad: 4,
            opacity: 0.95
          }
        ]
      }
    },

    // 3. Cumulative Enrollment Curve
    cumulativeCurve: {
      data: [
        {
          x: months,
          y: cumulativeForecast,
          mode: 'lines+markers',
          name: 'Planned (Cumulative)',
          line: { color: '#0066cc', width: 3 },
          marker: { size: 6 }
        },
        {
          x: months,
          y: cumulativeActual,
          mode: 'lines+markers',
          name: 'Actual (Cumulative)',
          line: { color: '#00aa44', width: 3 },
          marker: { size: 6 }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '3. Cumulative Enrollment Curve', font: { size: 14, weight: 'bold' } },
        margin: { l: 60, r: 30, t: 85, b: 60 },
        xaxis: { gridcolor: '#f0f0f0' },
        yaxis: { title: 'Cumulative Subjects', gridcolor: '#f0f0f0', rangemode: 'tozero' },
        annotations: [
          {
            x: months[months.length - 1] || '',
            y: cumulativeActual[cumulativeActual.length - 1] || 0,
            text: enrollmentLag < 0
              ? `Behind by ${Math.round(cumulativeForecast[cumulativeForecast.length - 1] - cumulativeActual[cumulativeActual.length - 1])} subjects<br>(${Math.abs(enrollmentLag)}% lag)`
              : enrollmentLag > 0
                ? `Ahead by ${Math.round(cumulativeActual[cumulativeActual.length - 1] - cumulativeForecast[cumulativeForecast.length - 1])} subjects<br>(${enrollmentLag}% lead)`
                : 'No cumulative lag',
            showarrow: true,
            arrowhead: 2,
            ax: -70,
            ay: -45,
            bgcolor: '#ffffff',
            bordercolor: '#0066cc',
            borderwidth: 1.5,
            borderpad: 4,
            opacity: 0.95
          }
        ]
      }
    },

    // 2. Forecast vs Actual Monthly Bar
    forecastVsActualBar: {
      data: [
        {
          x: months,
          y: forecastDemand,
          type: 'bar',
          name: 'Forecast',
          marker: { color: '#0066cc' }
        },
        {
          x: months,
          y: actualDemand,
          type: 'bar',
          name: 'Actual',
          marker: { color: '#00aa44' }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '2. Forecast vs Actual (Monthly)', font: { size: 14, weight: 'bold' } },
        barmode: 'group',
        margin: { l: 60, r: 30, t: 85, b: 50 },
        xaxis: { gridcolor: '#f0f0f0' },
        yaxis: { title: 'Subjects', gridcolor: '#f0f0f0' }
      }
    },

    // 4. Country Contribution Donut Chart
    countryContributionPie: {
      data: [
        {
          values: countryContribution.map(c => c.value),
          labels: countryContribution.map(c => c.country),
          type: 'pie',
          hole: 0.45,
          marker: {
            colors: ['#0066cc', '#00aa44', '#ff8800', '#d32f2f', '#9c27b0', '#00bcd4', '#795548', '#607d8b']
          },
          hoverinfo: 'label+percent+value',
          textinfo: 'percent'
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '5. Country Contribution (% of Total Forecast)', font: { size: 14, weight: 'bold' } },
        margin: { l: 20, r: 20, t: 60, b: 20 },
        legend: { orientation: 'v', x: 0.85, y: 0.5 }
      }
    },

    // 5. Bubble Chart - Site Risk
    siteRiskBubble: {
      data: [
        {
          x: bubbleChartData.x,
          y: bubbleChartData.y,
          mode: 'markers',
          text: bubbleChartData.text,
          marker: {
            size: bubbleChartData.size,
            sizemode: 'area',
            sizeref: 2.0 * Math.max(...bubbleChartData.size) / (40 ** 2), // size scale
            color: bubbleChartData.color,
            line: { color: '#fff', width: 2 }
          }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '9. Bubble Chart - Site Risk', font: { size: 14, weight: 'bold' } },
        margin: { l: 60, r: 30, t: 85, b: 60 },
        xaxis: { title: 'Enrollment (Subjects)', gridcolor: '#f0f0f0', rangemode: 'tozero' },
        yaxis: { title: 'Discontinuation Rate (%)', gridcolor: '#f0f0f0', rangemode: 'tozero' },
        hovermode: 'closest',
        showlegend: false
      }
    },

    // 6. Lead Time Impact Trend
    leadTimeImpact: {
      data: [
        {
          x: leadTimeTrend.x,
          y: leadTimeTrend.leadTimeDays,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Lead Time (Days)',
          line: { color: '#0066cc', width: 3 },
          marker: { color: '#0066cc' }
        },
        {
          x: leadTimeTrend.x,
          y: leadTimeTrend.demandImpactPct,
          type: 'scatter',
          mode: 'lines+markers',
          name: 'Impact on Demand (%)',
          yaxis: 'y2',
          line: { color: '#9c27b0', width: 3 },
          marker: { color: '#9c27b0' }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '6. Lead Time Impact Trend', font: { size: 14, weight: 'bold' } },
        margin: { l: 60, r: 60, t: 85, b: 60 },
        xaxis: { gridcolor: '#f0f0f0' },
        yaxis: { title: 'Lead Time (Days)', gridcolor: '#f0f0f0', titlefont: { color: '#0066cc' }, tickfont: { color: '#0066cc' } },
        yaxis2: {
          title: 'Impact on Demand (%)',
          overlaying: 'y',
          side: 'right',
          showgrid: false,
          ticksuffix: '%',
          titlefont: { color: '#9c27b0' },
          tickfont: { color: '#9c27b0' }
        }
      }
    },

    // 7. Geographic Enrollment Choropleth Map
    geographicMap: {
      data: [
        {
          type: 'choropleth',
          locations: countryContribution.map(c => c.iso),
          z: countryContribution.map(c => c.mapLevel),
          text: countryContribution.map(c => `${c.country}: ${c.actual} subjects (${c.levelName})`),
          colorscale: [
            [0, '#e0e0e0'],      // None
            [0.25, '#e0e0e0'],
            [0.25, '#ffe082'],   // Low (light yellow/orange)
            [0.5, '#ffe082'],
            [0.5, '#ff9800'],    // Medium (orange)
            [0.75, '#ff9800'],
            [0.75, '#2e7d32'],   // High (green)
            [1.0, '#2e7d32']
          ],
          zmin: 0,
          zmax: 3,
          autocolorscale: false,
          reversescale: false,
          marker: {
            line: {
              color: 'rgb(220,220,220)',
              width: 1
            }
          },
          colorbar: {
            title: 'Subjects (Actual)',
            tickvals: [0.375, 1.125, 1.875, 2.625],
            ticktext: ['None', 'Low', 'Medium', 'High'],
            thickness: 12,
            len: 0.7
          }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '7. Geographic Enrollment Map', font: { size: 14, weight: 'bold' } },
        geo: {
          showframe: false,
          showcoastlines: true,
          projection: {
            type: 'mercator'
          },
          bgcolor: 'rgba(0,0,0,0)',
          fitbounds: 'locations',
          visible: true
        },
        margin: { l: 10, r: 10, t: 85, b: 20 },
        showlegend: false
      }
    },

    // 8. Weekly Enrollment Velocity
    weeklyVelocity: {
      data: [
        {
          x: weeklyRates.x,
          y: weeklyRates.enrollment,
          mode: 'lines+markers',
          name: 'Enrollment Rate',
          line: { color: '#0066cc', width: 2 }
        },
        {
          x: weeklyRates.x,
          y: weeklyRates.randomization,
          mode: 'lines+markers',
          name: 'Randomization Rate',
          line: { color: '#00aa44', width: 2 }
        },
        {
          x: weeklyRates.x,
          y: weeklyRates.discontinuation,
          mode: 'lines+markers',
          name: 'Discontinuation Rate',
          line: { color: '#9c27b0', width: 2 }
        }
      ],
      layout: {
        ...defaultLayout,
        title: { text: '8. Enrollment Velocity (Weekly Rates)', font: { size: 14, weight: 'bold' } },
        margin: { l: 60, r: 30, t: 60, b: 80 },
        xaxis: { gridcolor: '#f0f0f0' },
        yaxis: { title: 'Subjects / Week', gridcolor: '#f0f0f0', rangemode: 'tozero' }
      }
    }
  };

  // Derived Dynamic KPI metrics
  const activeSubjectsCalculated = useMemo(() => {
    const planned = baselineData.total_planned_subjects || 1620;
    const vMod = 1 + (velocityModifier / 100);
    const dMod = 1 - ((15 * (1 + discontinuationMod / 100)) / 100); // Retention factor
    return Math.round(planned * vMod * dMod);
  }, [baselineData, velocityModifier, discontinuationMod]);

  // ============================================================
  // RENDER LAYOUT
  // ============================================================
  return (
    <div>
      {/* 1. DYNAMIC CONTROLS PANEL CARD (SOLVES STATIC ISSUE) */}
      <div className="card elevated" style={{ borderLeft: '4px solid var(--primary)', background: 'linear-gradient(to right, #fdfdfd, #f8f9fa)' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1.2rem' }}>
            🎛️ Analytics Interactive Controls
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            Adjust these sliders to simulate enrollment scenarios, supply shocks, or velocity shifts, updating all 9 charts dynamically.
          </p>
        </div>

        <div className="form-row four" style={{ gap: '1.5rem', marginBottom: '0.5rem' }}>
          {/* Slider 1: Lag Modifier */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>👥 Enrollment Lag</span>
              <strong style={{ color: enrollmentLag < 0 ? 'var(--danger)' : 'var(--success)' }}>{enrollmentLag}%</strong>
            </label>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={enrollmentLag}
              onChange={(e) => setEnrollmentLag(parseInt(e.target.value))}
            />
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '-0.25rem' }}>
              Shifts actual enrollment line
            </small>
          </div>

          {/* Slider 2: Weekly Velocity Modifier */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>⚡ Weekly Velocity</span>
              <strong style={{ color: velocityModifier < 0 ? 'var(--danger)' : 'var(--success)' }}>
                {velocityModifier >= 0 ? '+' : ''}{velocityModifier}%
              </strong>
            </label>
            <input
              type="range"
              min="-50"
              max="50"
              step="1"
              value={velocityModifier}
              onChange={(e) => setVelocityModifier(parseInt(e.target.value))}
            />
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '-0.25rem' }}>
              Modifies weekly rates & sizes
            </small>
          </div>

          {/* Slider 3: Lead Time Delta */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>⏱️ Lead Time Delta</span>
              <strong style={{ color: leadTimeDelta > 0 ? 'var(--warning)' : 'var(--success)' }}>
                {leadTimeDelta >= 0 ? '+' : ''}{leadTimeDelta} Days
              </strong>
            </label>
            <input
              type="range"
              min="-15"
              max="30"
              step="1"
              value={leadTimeDelta}
              onChange={(e) => setLeadTimeDelta(parseInt(e.target.value))}
            />
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '-0.25rem' }}>
              Adjusts dual-axis supply trends
            </small>
          </div>

          {/* Slider 4: Discontinuation Modifier */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span>🏥 Discontinuation Mod</span>
              <strong style={{ color: discontinuationMod > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {discontinuationMod >= 0 ? '+' : ''}{discontinuationMod}%
              </strong>
            </label>
            <input
              type="range"
              min="-30"
              max="50"
              step="1"
              value={discontinuationMod}
              onChange={(e) => setDiscontinuationMod(parseInt(e.target.value))}
            />
            <small style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '-0.25rem' }}>
              Modifies site risk percentages
            </small>
          </div>
        </div>
      </div>

      {/* Tab Header Card */}
      <div className="card elevated" style={{ padding: '1rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Analytics Dashboard</h2>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Interactive visualization models corresponding to graphs 1-9.
            </p>
          </div>

          {/* Sub-tabs Selection */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-small ${activeSubTab === 'enrollment' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveSubTab('enrollment')}
            >
              📈 Enrollment Trends
            </button>
            <button
              type="button"
              className={`btn btn-small ${activeSubTab === 'site-country' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveSubTab('site-country')}
            >
              🏥 Site & Country
            </button>
            <button
              type="button"
              className={`btn btn-small ${activeSubTab === 'supply' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveSubTab('supply')}
            >
              ⏱️ Supply Chain
            </button>
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}

      {/* 1. ENROLLMENT TRENDS SUB-TAB */}
      {activeSubTab === 'enrollment' && (
        <div className="scenario-results">
          {/* KPI Row */}
          <div className="scenario-kpi-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="scenario-kpi-card negative">
              <div className="kpi-label">Forecasted Subjects</div>
              <div className="kpi-value">{baselineData.total_planned_subjects.toLocaleString()}</div>
              <div className="kpi-delta" style={{ color: 'var(--text-secondary)' }}>Target Enrollment</div>
            </div>
            <div className="scenario-kpi-card negative">
              <div className="kpi-label">Actual Enrolled</div>
              <div className="kpi-value">
                {actualDemand.reduce((s, v) => s + v, 0).toLocaleString()}
              </div>
              <div className={`kpi-delta ${enrollmentLag < 0 ? 'down' : enrollmentLag > 0 ? 'up' : ''}`}>
                {enrollmentLag < 0 ? '-' : enrollmentLag > 0 ? '+' : ''}{Math.abs(enrollmentLag)}% variance
              </div>
            </div>
            <div className="scenario-kpi-card warning">
              <div className="kpi-label">Enrollment Rate</div>
              <div className="kpi-value">
                {Math.max(0, (27.4 * (1 + velocityModifier / 100)).toFixed(1))}
              </div>
              <div className={`kpi-delta ${velocityModifier >= 0 ? 'up' : 'down'}`}>
                {velocityModifier >= 0 ? '↑' : '↓'} {Math.abs(velocityModifier)}% vs baseline
              </div>
            </div>
            <div className="scenario-kpi-card positive">
              <div className="kpi-label">Active Subjects</div>
              <div className="kpi-value">{activeSubjectsCalculated.toLocaleString()}</div>
              <div className="kpi-delta" style={{ color: 'var(--text-secondary)' }}>Based on modifiers</div>
            </div>
            <div className="scenario-kpi-card">
              <div className="kpi-label">Retention Rate</div>
              <div className="kpi-value">
                {Math.max(0, Math.min(100, 88.1 * (1 - discontinuationMod / 200))).toFixed(1)}%
              </div>
              <div className="kpi-delta" style={{ color: 'var(--text-secondary)' }}>Subjects completing</div>
            </div>
          </div>

          {/* Grid for Charts 1 & 3 */}
          <div className="grid cols-2">
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.actualVsForecast.data}
                layout={chartStyles.actualVsForecast.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.cumulativeCurve.data}
                layout={chartStyles.cumulativeCurve.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Grid for Chart 2 & Velocity Chart 8 */}
          <div className="grid cols-2" style={{ marginTop: '1.5rem' }}>
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.forecastVsActualBar.data}
                layout={chartStyles.forecastVsActualBar.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />

              {/* Variance row table matching table under graph 2 */}
              <div style={{ marginTop: '1.25rem', overflowX: 'auto' }}>
                <table className="scenario-history-table" style={{ margin: 0, fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.5rem 0.6rem' }}>Month</th>
                      {months.map((m, idx) => (
                        <th key={m} style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                          {m.split(' ')[0].substring(0, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>Variance %</td>
                      {monthlyVariances.map((v, idx) => (
                        <td
                          key={idx}
                          style={{
                            padding: '0.5rem 0.6rem',
                            textAlign: 'center',
                            fontWeight: 600,
                            color: v < 0 ? 'var(--danger)' : v > 0 ? 'var(--success)' : 'var(--text-primary)'
                          }}
                        >
                          {v > 0 ? '+' : ''}{v}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.weeklyVelocity.data}
                layout={chartStyles.weeklyVelocity.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. SITE & COUNTRY SUB-TAB */}
      {activeSubTab === 'site-country' && (
        <div className="scenario-results">
          {/* Top row: Pie Chart 5 & Map Chart 7 */}
          <div className="grid cols-2">
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.countryContributionPie.data}
                layout={chartStyles.countryContributionPie.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.geographicMap.data}
                layout={chartStyles.geographicMap.layout}
                config={{ responsive: true, displayModeBar: true, scrollZoom: true }}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Bottom row: Heatmap Table 4 & Bubble Chart 9 */}
          <div className="grid cols-2" style={{ marginTop: '1.5rem' }}>
            {/* Site Performance Table */}
            <div className="card elevated" style={{ padding: '1.5rem', marginBottom: 0, overflowY: 'auto', maxHeight: '420px' }}>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--primary)', marginBottom: '1rem' }}>
                4. Site Performance Heatmap
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="scenario-history-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Enrollment (Actual)</th>
                      <th>% of Total</th>
                      <th>vs Target %</th>
                      <th>Risk Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteData.map(site => (
                      <tr key={site.id}>
                        <td><strong>{site.id}</strong></td>
                        <td>{site.actual.toLocaleString()}</td>
                        <td>{site.pctOfTotal}%</td>
                        <td style={{ color: site.vsTarget >= 100 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {site.vsTarget}%
                        </td>
                        <td>
                          <span className={`status-badge ${site.class}`} style={{ marginLeft: 0 }}>
                            {site.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bubble Chart */}
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.siteRiskBubble.data}
                layout={chartStyles.siteRiskBubble.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. SUPPLY CHAIN & LEAD TIME SUB-TAB */}
      {activeSubTab === 'supply' && (
        <div className="scenario-results">
          <div className="grid cols-2">
            <div className="chart-container elevated" style={{ padding: '1rem' }}>
              <Plot
                data={chartStyles.leadTimeImpact.data}
                layout={chartStyles.leadTimeImpact.layout}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>

            {/* Explanatory description card matching Chart 6 specifications */}
            <div className="card elevated" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justify: 'center' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '1.25rem' }}>
                ⏱️ Lead Time Impact Analysis
              </h3>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1rem' }}>
                This dual-axis trend graph illustrates the critical relationship between <strong>Supply Chain Lead Times</strong> (left y-axis, blue) and the resulting <strong>Compound Impact on Demand Forecast Buffer</strong> (right y-axis, purple).
              </p>

              <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '1rem', borderLeft: '4px solid var(--warning)' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--warning)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  ⚠️ Critical Supply Chain Takeaway
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  As lead time delta is shifted to <strong>{leadTimeDelta >= 0 ? '+' : ''}{leadTimeDelta} days</strong> (resulting in average lead times of <strong>{Math.max(5, 32 + leadTimeDelta)} days</strong>), the average demand impact changes by <strong>{avgDemandImpact >= 0 ? '+' : ''}{avgDemandImpact}%</strong>.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="stat-box" style={{ padding: '1rem' }}>
                  <div className="stat-label">Simulated Lead Time</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{Math.max(5, 32 + leadTimeDelta)} Days</div>
                </div>
                <div className="stat-box" style={{ padding: '1rem' }}>
                  <div className="stat-label">Planning Buffer Impact</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: '#9c27b0' }}>
                    {avgDemandImpact >= 0 ? '+' : ''}{avgDemandImpact}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemandCharts;
