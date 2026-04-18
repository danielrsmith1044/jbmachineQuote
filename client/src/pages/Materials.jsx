import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from '../api.js';
import { parseDelimited, detectDelimiter, mapHeaders, rowsToMaterials } from '../csv.js';

function blankMaterial() {
  return {
    name: '',
    unit_of_measure: 'ft',
    supplier: '',
    base_price: 0,
    in_stock: true,
    notes: '',
    pricing_tiers: []
  };
}

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [editing, setEditing] = useState(null); // material object or null
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);

  async function load() {
    setLoading(true);
    setMaterials(await api.listMaterials());
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(m) {
    if (m.id) {
      await api.updateMaterial(m.id, m);
    } else {
      await api.createMaterial(m);
    }
    setEditing(null);
    load();
  }

  async function remove(id) {
    if (!confirm('Delete this material? Existing quotes keep a snapshot.')) return;
    await api.deleteMaterial(id);
    load();
  }

  async function seedStarter() {
    if (!confirm('Add ~35 common machine-shop materials with approximate prices? Existing materials (by name) will be skipped.')) return;
    const r = await api.seedStarterCatalog();
    setToast(`Added ${r.inserted} materials. ${r.skipped} skipped (already existed).`);
    setTimeout(() => setToast(null), 3500);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Materials</h1>
          <div className="subtitle">Stock list with bulk pricing tiers</div>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={seedStarter}>Seed starter catalog</button>
          <button className="btn" onClick={() => setImporting((v) => !v)}>
            {importing ? 'Close import' : 'Import CSV'}
          </button>
          <button className="btn primary" onClick={() => setEditing(blankMaterial())}>
            + New Material
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {importing && (
        <CsvImportPanel
          onClose={() => setImporting(false)}
          onImported={(msg) => {
            setToast(msg);
            setTimeout(() => setToast(null), 3500);
            load();
          }}
        />
      )}

      {editing && (
        <MaterialEditor
          material={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : materials.length === 0 ? (
          <div className="empty">No materials yet. Add your first one to start quoting.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Unit</th>
                <th>Supplier</th>
                <th className="num">Base price</th>
                <th>Stock</th>
                <th className="num">Tiers</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.notes ? <div className="small muted">{m.notes}</div> : null}
                  </td>
                  <td>{m.unit_of_measure}</td>
                  <td>{m.supplier || '—'}</td>
                  <td className="num">{fmtMoney(m.base_price)}</td>
                  <td>
                    {m.in_stock ? (
                      <span className="status-pill status-Accepted">In stock</span>
                    ) : (
                      <span className="status-pill status-Declined">Order</span>
                    )}
                  </td>
                  <td className="num">{m.pricing_tiers?.length || 0}</td>
                  <td className="right">
                    <button className="btn sm" onClick={() => setEditing(m)}>Edit</button>{' '}
                    <button className="btn sm danger" onClick={() => remove(m.id)}>Delete</button>
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

function MaterialEditor({ material, onCancel, onSave }) {
  const [m, setM] = useState(() => ({
    ...material,
    pricing_tiers: material.pricing_tiers ? material.pricing_tiers.map((t) => ({ ...t })) : []
  }));

  function update(patch) {
    setM((prev) => ({ ...prev, ...patch }));
  }
  function updateTier(i, patch) {
    setM((prev) => {
      const t = [...prev.pricing_tiers];
      t[i] = { ...t[i], ...patch };
      return { ...prev, pricing_tiers: t };
    });
  }
  function addTier() {
    const last = m.pricing_tiers[m.pricing_tiers.length - 1];
    const nextMin = last ? Number(last.max_quantity || last.min_quantity || 0) + 1 : 1;
    setM((prev) => ({
      ...prev,
      pricing_tiers: [
        ...prev.pricing_tiers,
        { min_quantity: nextMin, max_quantity: null, price_per_unit: prev.base_price }
      ]
    }));
  }
  function removeTier(i) {
    setM((prev) => ({
      ...prev,
      pricing_tiers: prev.pricing_tiers.filter((_, idx) => idx !== i)
    }));
  }

  return (
    <div className="card">
      <h2>{m.id ? 'Edit material' : 'New material'}</h2>
      <div className="grid-3">
        <div className="field">
          <label>Name</label>
          <input
            placeholder="6061 Aluminum Round Bar 1.5in"
            value={m.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Unit of measure</label>
          <input
            placeholder="ft, lb, piece"
            value={m.unit_of_measure}
            onChange={(e) => update({ unit_of_measure: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Supplier</label>
          <input
            value={m.supplier || ''}
            onChange={(e) => update({ supplier: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Base price / unit</label>
          <input
            type="number"
            step="0.01"
            value={m.base_price}
            onChange={(e) => update({ base_price: Number(e.target.value || 0) })}
          />
        </div>
        <div className="field">
          <label>Stock</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={!!m.in_stock}
              onChange={(e) => update({ in_stock: e.target.checked })}
            />
            Typically in stock
          </label>
        </div>
        <div className="field" style={{ gridColumn: 'span 3' }}>
          <label>Notes</label>
          <input
            placeholder="Lead time 3 days, usually in stock…"
            value={m.notes || ''}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>
      </div>

      <div className="divider" />

      <h2>Bulk Pricing Tiers</h2>
      <p className="small muted" style={{ marginTop: -8 }}>
        Leave “max” blank on the last tier for “and up”. If a quoted quantity doesn't match
        any tier, the base price is used.
      </p>
      {m.pricing_tiers.length === 0 && (
        <div className="empty" style={{ marginBottom: 10 }}>
          No tiers. Base price will be used for all quantities.
        </div>
      )}
      {m.pricing_tiers.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th className="num">Min qty</th>
              <th className="num">Max qty</th>
              <th className="num">Price / unit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {m.pricing_tiers.map((t, i) => (
              <tr key={i}>
                <td className="num">
                  <input
                    type="number"
                    value={t.min_quantity}
                    onChange={(e) => updateTier(i, { min_quantity: Number(e.target.value || 0) })}
                    style={{ width: 100, textAlign: 'right' }}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    placeholder="(no max)"
                    value={t.max_quantity == null ? '' : t.max_quantity}
                    onChange={(e) =>
                      updateTier(i, {
                        max_quantity: e.target.value === '' ? null : Number(e.target.value)
                      })
                    }
                    style={{ width: 100, textAlign: 'right' }}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    step="0.01"
                    value={t.price_per_unit}
                    onChange={(e) => updateTier(i, { price_per_unit: Number(e.target.value || 0) })}
                    style={{ width: 120, textAlign: 'right' }}
                  />
                </td>
                <td className="right">
                  <button className="btn sm ghost" onClick={() => removeTier(i)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="btn" onClick={addTier}>+ Add tier</button>
      </div>

      <div className="divider" />
      <div className="btn-row">
        <button className="btn primary" onClick={() => onSave(m)} disabled={!m.name || !m.unit_of_measure}>
          Save material
        </button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const CSV_TEMPLATE =
  'name,unit_of_measure,supplier,base_price,in_stock,notes\n' +
  '6061-T6 Aluminum Round 1.0in,ft,Online Metals,7.50,yes,easy machining\n' +
  '303 Stainless Round 0.5in,ft,Online Metals,7.25,yes,\n';

function CsvImportPanel({ onClose, onImported }) {
  const [text, setText] = React.useState('');
  const [overwrite, setOverwrite] = React.useState(false);
  const [error, setError] = React.useState('');

  const parsed = React.useMemo(() => {
    if (!text.trim()) return null;
    try {
      const delim = detectDelimiter(text);
      const rows = parseDelimited(text, delim);
      if (rows.length < 1) return { error: 'No rows found' };
      const headerMap = mapHeaders(rows[0]);
      if (headerMap.name == null || headerMap.unit_of_measure == null) {
        return {
          error: 'Could not find required columns. Header row must include a name column and a unit (or unit_of_measure) column.'
        };
      }
      const materials = rowsToMaterials(rows.slice(1), headerMap);
      return { materials, delim, columnCount: rows[0].length, headers: rows[0] };
    } catch (e) {
      return { error: e.message };
    }
  }, [text]);

  async function doImport() {
    setError('');
    if (!parsed?.materials?.length) return;
    try {
      const r = await api.bulkImportMaterials(parsed.materials, overwrite);
      const msg =
        `Imported ${r.inserted}` +
        (r.updated ? `, updated ${r.updated}` : '') +
        (r.skipped ? `, skipped ${r.skipped}` : '') +
        (r.errors?.length ? `, ${r.errors.length} errors` : '');
      onImported(msg);
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Import Materials from CSV / TSV</h2>
      <p className="small muted" style={{ marginTop: -8 }}>
        Paste tab or comma separated rows. First row = headers. Required:{' '}
        <code>name</code> and <code>unit</code> (or <code>unit_of_measure</code>). Optional:{' '}
        <code>supplier</code>, <code>base_price</code>, <code>in_stock</code>, <code>notes</code>.
        Pricing tiers are not importable via CSV — edit them after import.
      </p>
      <div style={{ margin: '8px 0' }}>
        <button className="btn sm ghost" onClick={() => setText(CSV_TEMPLATE)}>
          Paste example template
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your CSV or TSV here…"
        style={{
          width: '100%',
          minHeight: 140,
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 9,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12
        }}
      />

      {parsed?.error && <div className="empty" style={{ color: 'var(--danger)' }}>{parsed.error}</div>}

      {parsed?.materials && (
        <>
          <div className="small muted" style={{ margin: '10px 0 6px' }}>
            Preview — {parsed.materials.length} row{parsed.materials.length === 1 ? '' : 's'}{' '}
            (delimiter: {parsed.delim === '\t' ? 'tab' : parsed.delim === ',' ? 'comma' : 'semicolon'})
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Supplier</th>
                  <th className="num">Price</th>
                  <th>Stock</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {parsed.materials.slice(0, 50).map((m, i) => (
                  <tr key={i}>
                    <td>{m.name || <span className="muted">(missing)</span>}</td>
                    <td>{m.unit_of_measure || <span className="muted">(missing)</span>}</td>
                    <td>{m.supplier || '—'}</td>
                    <td className="num">{fmtMoney(m.base_price)}</td>
                    <td>{String(m.in_stock ?? '')}</td>
                    <td className="small muted">{m.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.materials.length > 50 && (
              <div className="small muted" style={{ padding: 8 }}>
                +{parsed.materials.length - 50} more not shown
              </div>
            )}
          </div>
        </>
      )}

      <div className="divider" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
        />
        Update existing materials with matching names (otherwise they're skipped)
      </label>
      {error && <div className="empty" style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!parsed?.materials?.length}
          onClick={doImport}
        >
          Import {parsed?.materials?.length || 0} material{parsed?.materials?.length === 1 ? '' : 's'}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
