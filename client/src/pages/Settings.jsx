import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(setS);
  }, []);

  function update(patch) {
    setS((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    const out = await api.saveSettings(s);
    setS(out);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!s) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Shop Settings</h1>
          <div className="subtitle">These appear on every quote and PDF</div>
        </div>
        <div className="btn-row">
          {saved && <span className="save-indicator saved">Saved</span>}
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      <div className="card">
        <h2>Shop Identity</h2>
        <div className="grid-2">
          <div className="field">
            <label>Shop name</label>
            <input value={s.shop_name || ''} onChange={(e) => update({ shop_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={s.shop_phone || ''} onChange={(e) => update({ shop_phone: e.target.value })} />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Address</label>
            <textarea
              rows={3}
              value={s.shop_address || ''}
              onChange={(e) => update({ shop_address: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={s.shop_email || ''} onChange={(e) => update({ shop_email: e.target.value })} />
          </div>
          <div className="field">
            <label>Quote reference prefix</label>
            <input
              value={s.quote_reference_prefix || ''}
              onChange={(e) => update({ quote_reference_prefix: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Defaults</h2>
        <div className="grid-3">
          <div className="field">
            <label>Default labor rate ($/hr)</label>
            <input
              type="number"
              step="0.01"
              value={s.default_labor_rate || 0}
              onChange={(e) => update({ default_labor_rate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Default markup %</label>
            <input
              type="number"
              step="0.1"
              value={s.default_markup_percent || 0}
              onChange={(e) => update({ default_markup_percent: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Next quote number</label>
            <input
              type="number"
              value={s.next_quote_number || 0}
              onChange={(e) => update({ next_quote_number: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Default Terms (appears on PDFs)</h2>
        <textarea
          rows={4}
          style={{ width: '100%' }}
          value={s.default_terms || ''}
          onChange={(e) => update({ default_terms: e.target.value })}
        />
      </div>
    </div>
  );
}
