import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtMoney, fmtDate } from '../api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getDashboard().then(setData);
  }, []);

  if (!data) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="subtitle">Recent activity at a glance</div>
        </div>
        <button className="btn primary" onClick={() => navigate('/quotes/new')}>
          + New Quote
        </button>
      </div>

      <div className="grid-4">
        <div className="stat">
          <div className="label">Quotes this month</div>
          <div className="value">{data.month_quotes}</div>
          <div className="sub">{fmtMoney(data.month_value)} pipeline</div>
        </div>
        <div className="stat">
          <div className="label">Total quotes</div>
          <div className="value">{data.total_quotes}</div>
          <div className="sub">All time</div>
        </div>
        <div className="stat">
          <div className="label">Acceptance rate</div>
          <div className="value">
            {(data.acceptance_rate * 100).toFixed(0)}%
          </div>
          <div className="sub">
            {data.accepted} accepted · {data.declined} declined
          </div>
        </div>
        <div className="stat">
          <div className="label">By status</div>
          <div style={{ marginTop: 6 }}>
            {data.counts_by_status.length === 0 ? (
              <div className="sub">No quotes yet</div>
            ) : (
              data.counts_by_status.map((c) => (
                <div key={c.status} className="small" style={{ marginBottom: 2 }}>
                  <span className={`status-pill status-${c.status}`}>{c.status}</span>{' '}
                  <strong>{c.n}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Top Customers</h2>
          {data.top_customers.length === 0 ? (
            <div className="empty">No quotes yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Quotes</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.map((c) => (
                  <tr key={c.customer_name}>
                    <td>{c.customer_name}</td>
                    <td className="num">{c.quote_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Recent Quotes</h2>
          {data.recent.length === 0 ? (
            <div className="empty">Nothing here yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((q) => (
                  <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/quotes/${q.id}`)}>
                    <td><strong>{q.reference}</strong></td>
                    <td>{fmtDate(q.date)}</td>
                    <td>{q.customer_name || '—'}</td>
                    <td>
                      <span className={`status-pill status-${q.status}`}>{q.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
