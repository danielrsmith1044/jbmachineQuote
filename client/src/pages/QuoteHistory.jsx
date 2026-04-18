import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtMoney, fmtDate } from '../api.js';

const STATUSES = ['', 'Draft', 'Sent', 'Accepted', 'Declined'];

export default function QuoteHistory() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });

  async function load() {
    setLoading(true);
    const data = await api.listQuotes(filters);
    setQuotes(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.from, filters.to]);

  function onSubmit(e) {
    e.preventDefault();
    load();
  }

  async function handleDuplicate(id) {
    const dup = await api.duplicateQuote(id);
    navigate(`/quotes/${dup.id}`);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this quote?')) return;
    await api.deleteQuote(id);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Quote History</h1>
          <div className="subtitle">Search and reopen past quotes</div>
        </div>
        <button className="btn primary" onClick={() => navigate('/quotes/new')}>
          + New Quote
        </button>
      </div>

      <div className="card">
        <form className="toolbar" onSubmit={onSubmit}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Search</label>
            <input
              placeholder="Customer, job, drawing #, reference…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s || 'Any'}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <button className="btn" type="submit">Search</button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setFilters({ q: '', status: '', from: '', to: '' });
              setTimeout(load, 0);
            }}
          >
            Reset
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : quotes.length === 0 ? (
          <div className="empty">No quotes found.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Job / Part</th>
                <th>Drawing #</th>
                <th>Status</th>
                <th className="num">First tier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} style={{ cursor: 'pointer' }}>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>
                    <strong>{q.reference}</strong>
                  </td>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>{fmtDate(q.date)}</td>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>{q.customer_name || '—'}</td>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>
                    {q.job_name || '—'}
                    {q.converted_to_job ? (
                      <span className="status-pill status-Accepted" style={{ marginLeft: 8 }}>
                        Job
                      </span>
                    ) : null}
                  </td>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>{q.drawing_number || '—'}</td>
                  <td onClick={() => navigate(`/quotes/${q.id}`)}>
                    <span className={`status-pill status-${q.status}`}>{q.status}</span>
                  </td>
                  <td className="num" onClick={() => navigate(`/quotes/${q.id}`)}>
                    {fmtMoney(q.summary_total)}
                  </td>
                  <td className="right">
                    <button className="btn sm" onClick={() => handleDuplicate(q.id)}>
                      Duplicate
                    </button>{' '}
                    <a className="btn sm" href={api.pdfUrl(q.id)} target="_blank" rel="noreferrer">
                      PDF
                    </a>{' '}
                    <button className="btn sm danger" onClick={() => handleDelete(q.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
