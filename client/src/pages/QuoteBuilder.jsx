import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtMoney } from '../api.js';

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined'];

function blankQuote(settings) {
  return {
    customer_name: '',
    job_name: '',
    drawing_number: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    setup_hours: 0,
    per_piece_hours: 0,
    labor_rate: Number(settings?.default_labor_rate || 0),
    markup_percent: Number(settings?.default_markup_percent || 0),
    notes: '',
    quantities: [{ quantity: 1 }, { quantity: 10 }, { quantity: 100 }],
    materials: [],
    converted_to_job: false,
    job_notes: ''
  };
}

export default function QuoteBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [settings, setSettings] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const savedQuoteIdRef = useRef(id ? Number(id) : null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const pricingTimerRef = useRef(null);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [mats, st] = await Promise.all([api.listMaterials(), api.getSettings()]);
      setMaterials(mats);
      setSettings(st);
      if (id) {
        const q = await api.getQuote(id);
        setQuote(q);
        setPricing(q.pricing);
        savedQuoteIdRef.current = q.id;
      } else {
        setQuote(blankQuote(st));
      }
      setLoading(false);
    })();
  }, [id]);

  // Recompute pricing (server-side) with debounce when quote changes
  useEffect(() => {
    if (!quote) return;
    if (!savedQuoteIdRef.current) return;
    clearTimeout(pricingTimerRef.current);
    pricingTimerRef.current = setTimeout(async () => {
      try {
        const q = await api.getQuote(savedQuoteIdRef.current);
        setPricing(q.pricing);
      } catch {}
    }, 400);
    return () => clearTimeout(pricingTimerRef.current);
    // Only recompute when saveState flips to 'saved' to pull fresh server-calculated totals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState]);

  // Autosave: any change marks dirty and schedules a save
  useEffect(() => {
    if (!quote || loading) return;
    if (!dirtyRef.current) return;
    clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    saveTimerRef.current = setTimeout(doSave, 700);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  async function doSave() {
    if (!quote) return;
    try {
      const payload = { ...quote };
      let saved;
      if (savedQuoteIdRef.current) {
        saved = await api.updateQuote(savedQuoteIdRef.current, payload);
      } else {
        saved = await api.createQuote(payload);
        savedQuoteIdRef.current = saved.id;
        // Update URL without reload
        window.history.replaceState(null, '', `/quotes/${saved.id}`);
      }
      setPricing(saved.pricing);
      // Merge only server-authoritative fields (id, reference, updated_at)
      setQuote((prev) => ({
        ...prev,
        id: saved.id,
        reference: saved.reference,
        updated_at: saved.updated_at
      }));
      dirtyRef.current = false;
      setSaveState('saved');
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) {
      setSaveState('error');
      console.error(e);
    }
  }

  function update(patch) {
    dirtyRef.current = true;
    setQuote((prev) => ({ ...prev, ...patch }));
  }

  function updateQuantity(i, value) {
    dirtyRef.current = true;
    setQuote((prev) => {
      const qs = [...prev.quantities];
      qs[i] = { ...qs[i], quantity: value };
      return { ...prev, quantities: qs };
    });
  }
  function addQuantity() {
    dirtyRef.current = true;
    setQuote((prev) => ({
      ...prev,
      quantities: [...prev.quantities, { quantity: 0 }]
    }));
  }
  function removeQuantity(i) {
    dirtyRef.current = true;
    setQuote((prev) => ({
      ...prev,
      quantities: prev.quantities.filter((_, idx) => idx !== i)
    }));
  }

  function updateMaterial(i, patch) {
    dirtyRef.current = true;
    setQuote((prev) => {
      const ms = [...prev.materials];
      ms[i] = { ...ms[i], ...patch };
      return { ...prev, materials: ms };
    });
  }
  function addMaterial() {
    dirtyRef.current = true;
    setQuote((prev) => ({
      ...prev,
      materials: [
        ...prev.materials,
        { material_id: null, quantity_needed_per_unit: 1 }
      ]
    }));
  }
  function removeMaterial(i) {
    dirtyRef.current = true;
    setQuote((prev) => ({
      ...prev,
      materials: prev.materials.filter((_, idx) => idx !== i)
    }));
  }

  async function handleDuplicate() {
    if (!savedQuoteIdRef.current) return;
    // Make sure latest changes are saved first
    if (dirtyRef.current) await doSave();
    const dup = await api.duplicateQuote(savedQuoteIdRef.current);
    navigate(`/quotes/${dup.id}`);
  }

  async function handleDelete() {
    if (!savedQuoteIdRef.current) return;
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    await api.deleteQuote(savedQuoteIdRef.current);
    navigate('/quotes');
  }

  async function handleOpenPdf() {
    // Save first so server has latest
    if (dirtyRef.current) await doSave();
    if (!savedQuoteIdRef.current) return;
    window.open(api.pdfUrl(savedQuoteIdRef.current), '_blank');
  }

  async function handleNewQuote() {
    if (dirtyRef.current) await doSave();
    // Force a fresh builder state
    if (id) {
      navigate('/quotes/new');
    } else {
      // Already on /quotes/new — reset the in-memory quote
      savedQuoteIdRef.current = null;
      dirtyRef.current = false;
      setQuote(blankQuote(settings));
      setPricing(null);
      window.history.replaceState(null, '', '/quotes/new');
    }
  }

  async function refreshAttachments() {
    if (!savedQuoteIdRef.current) return;
    const atts = await api.listAttachments(savedQuoteIdRef.current);
    setQuote((prev) => (prev ? { ...prev, attachments: atts } : prev));
  }

  async function handleUploadFiles(files) {
    if (!files || !files.length) return;
    // Ensure we have a saved quote id first
    if (!savedQuoteIdRef.current) {
      dirtyRef.current = true;
      await doSave();
    }
    if (!savedQuoteIdRef.current) return;
    const atts = await api.uploadAttachments(savedQuoteIdRef.current, files);
    setQuote((prev) => (prev ? { ...prev, attachments: atts } : prev));
  }

  async function handleDeleteAttachment(attId) {
    if (!savedQuoteIdRef.current) return;
    if (!confirm('Remove this attachment?')) return;
    await api.deleteAttachment(savedQuoteIdRef.current, attId);
    await refreshAttachments();
  }

  const materialMap = useMemo(() => {
    const m = new Map();
    for (const mat of materials) m.set(mat.id, mat);
    return m;
  }, [materials]);

  if (loading || !quote) return <div className="muted">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{quote.reference ? `Quote ${quote.reference}` : 'New Quote'}</h1>
          <div className="subtitle">
            {quote.job_name || 'Untitled job'}
            {quote.customer_name ? ` — ${quote.customer_name}` : ''}
          </div>
        </div>
        <div className="btn-row">
          <SaveIndicator state={saveState} />
          <button
            className="btn primary"
            onClick={async () => {
              dirtyRef.current = true;
              await doSave();
            }}
          >
            Save
          </button>
          <button className="btn" onClick={handleNewQuote}>
            New Quote
          </button>
          <button
            className="btn"
            onClick={handleOpenPdf}
            disabled={!savedQuoteIdRef.current}
          >
            View PDF
          </button>
          <button
            className="btn"
            onClick={handleDuplicate}
            disabled={!savedQuoteIdRef.current}
          >
            Duplicate
          </button>
          <button
            className="btn danger"
            onClick={handleDelete}
            disabled={!savedQuoteIdRef.current}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Quote Info</h2>
        <div className="grid-3">
          <Field
            label="Customer"
            value={quote.customer_name || ''}
            onChange={(v) => update({ customer_name: v })}
          />
          <Field
            label="Job / Part"
            value={quote.job_name || ''}
            onChange={(v) => update({ job_name: v })}
          />
          <Field
            label="Drawing #"
            value={quote.drawing_number || ''}
            onChange={(v) => update({ drawing_number: v })}
          />
          <Field
            type="date"
            label="Date"
            value={quote.date || ''}
            onChange={(v) => update({ date: v })}
          />
          <SelectField
            label="Status"
            value={quote.status}
            options={STATUSES}
            onChange={(v) => update({ status: v })}
          />
          <Field
            type="number"
            label="Markup %"
            value={quote.markup_percent}
            onChange={(v) => update({ markup_percent: Number(v || 0) })}
          />
        </div>
      </div>

      <div className="card">
        <h2>Labor</h2>
        <div className="inline-row">
          <Field
            type="number"
            label="Setup hours"
            value={quote.setup_hours}
            onChange={(v) => update({ setup_hours: Number(v || 0) })}
            step="0.25"
          />
          <Field
            type="number"
            label="Per-piece hours"
            value={quote.per_piece_hours}
            onChange={(v) => update({ per_piece_hours: Number(v || 0) })}
            step="0.25"
          />
          <Field
            type="number"
            label="Hourly rate ($/hr)"
            value={quote.labor_rate}
            onChange={(v) => update({ labor_rate: Number(v || 0) })}
            step="0.01"
          />
          <div className="stat" style={{ padding: '8px 14px', minWidth: 160 }}>
            <div className="label">Setup cost</div>
            <div className="value" style={{ fontSize: 16 }}>
              {fmtMoney(Number(quote.setup_hours || 0) * Number(quote.labor_rate || 0))}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {fmtMoney(Number(quote.per_piece_hours || 0) * Number(quote.labor_rate || 0))} / piece
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Materials</h2>
        {quote.materials.length === 0 ? (
          <div className="empty">No materials added yet.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '55%' }}>Material</th>
                <th className="num">Needed per unit</th>
                <th className="num">Base price</th>
                <th className="num">Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quote.materials.map((m, i) => {
                const ref = materialMap.get(m.material_id);
                return (
                  <tr key={i}>
                    <td>
                      <select
                        value={m.material_id || ''}
                        onChange={(e) =>
                          updateMaterial(i, {
                            material_id: e.target.value ? Number(e.target.value) : null
                          })
                        }
                        style={{ width: '100%', padding: '6px 8px' }}
                      >
                        <option value="">— choose material —</option>
                        {materials.map((mat) => (
                          <option key={mat.id} value={mat.id}>
                            {mat.name} ({mat.unit_of_measure})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        step="0.001"
                        value={m.quantity_needed_per_unit}
                        onChange={(e) =>
                          updateMaterial(i, {
                            quantity_needed_per_unit: Number(e.target.value || 0)
                          })
                        }
                        style={{ width: 90, textAlign: 'right', padding: '5px 7px' }}
                      />
                      <span className="small muted" style={{ marginLeft: 4 }}>
                        {ref?.unit_of_measure || ''}
                      </span>
                    </td>
                    <td className="num">
                      {ref ? fmtMoney(ref.base_price) : '—'}
                    </td>
                    <td className="num">
                      {ref
                        ? ref.in_stock
                          ? <span className="status-pill status-Accepted">In stock</span>
                          : <span className="status-pill status-Declined">Order</span>
                        : '—'}
                    </td>
                    <td className="right">
                      <button className="btn sm ghost" onClick={() => removeMaterial(i)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={addMaterial}>+ Add material</button>
        </div>
      </div>

      <div className="card">
        <h2>Quantity Tiers &amp; Pricing</h2>
        <div className="inline-row" style={{ marginBottom: 12 }}>
          {quote.quantities.map((q, i) => (
            <div
              key={i}
              className="field"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <input
                type="number"
                min="1"
                value={q.quantity}
                onChange={(e) => updateQuantity(i, Number(e.target.value || 0))}
                style={{ width: 80, textAlign: 'right' }}
              />
              <button className="btn sm ghost" onClick={() => removeQuantity(i)}>×</button>
            </div>
          ))}
          <button className="btn" onClick={addQuantity}>+ Add tier</button>
        </div>

        <PricingTable pricing={pricing} />
      </div>

      <div className="card">
        <h2>Notes</h2>
        <textarea
          value={quote.notes || ''}
          onChange={(e) => update({ notes: e.target.value })}
          style={{
            width: '100%',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: 9,
            minHeight: 80,
            fontFamily: 'inherit',
            fontSize: 14
          }}
          placeholder="Internal or customer-facing notes for this quote…"
        />
      </div>

      <AttachmentsCard
        attachments={quote.attachments || []}
        quoteId={savedQuoteIdRef.current}
        onUpload={handleUploadFiles}
        onDelete={handleDeleteAttachment}
      />

      <div className="card">
        <h2>Job Tracking</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={!!quote.converted_to_job}
            onChange={(e) => update({ converted_to_job: e.target.checked })}
          />
          Mark this quote as converted to a job
        </label>
        {quote.converted_to_job && (
          <textarea
            value={quote.job_notes || ''}
            onChange={(e) => update({ job_notes: e.target.value })}
            placeholder="Job notes, dates, shop floor info…"
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: 9,
              minHeight: 60,
              fontFamily: 'inherit',
              fontSize: 14
            }}
          />
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }) {
  if (state === 'saving') return <span className="save-indicator saving">Saving…</span>;
  if (state === 'saved') return <span className="save-indicator saved">Saved</span>;
  if (state === 'error') return <span className="save-indicator" style={{ color: 'var(--danger)' }}>Save failed</span>;
  return <span className="save-indicator">&nbsp;</span>;
}

function Field({ label, value, onChange, type = 'text', step }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  const opts = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function PricingTable({ pricing }) {
  if (!pricing || !pricing.rows?.length) {
    return <div className="empty">Pricing will appear once quote is saved.</div>;
  }
  return (
    <table className="tier-table">
      <thead>
        <tr>
          <th>Quantity</th>
          <th>Material</th>
          <th>Labor</th>
          <th>Markup</th>
          <th>Per Unit</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {pricing.rows.map((r, i) => (
          <tr key={i}>
            <td className="qty">{r.quantity}</td>
            <td>
              {fmtMoney(r.material_total)}
              <div className="small muted">{fmtMoney(r.material_per_unit)} / unit</div>
            </td>
            <td>
              {fmtMoney(r.labor_total)}
              <div className="small muted">{fmtMoney(r.labor_per_unit)} / unit</div>
            </td>
            <td>{fmtMoney(r.markup_amount)}</td>
            <td>{fmtMoney(r.per_unit)}</td>
            <td className="total">{fmtMoney(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isImageMime(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

function extIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    pdf: 'PDF',
    dwg: 'DWG',
    dxf: 'DXF',
    step: 'STEP',
    stp: 'STEP',
    iges: 'IGES',
    igs: 'IGES',
    stl: 'STL',
    zip: 'ZIP'
  };
  return map[ext] || ext.toUpperCase() || 'FILE';
}

function AttachmentsCard({ attachments, quoteId, onUpload, onDelete }) {
  const inputRef = React.useRef(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    try {
      await onUpload(files);
    } catch (e) {
      alert('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="card">
      <h2>Attachments (Internal Only)</h2>
      <p className="small muted" style={{ marginTop: -8 }}>
        Drawings, STEP files, reference images. Not included in the customer PDF.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '18px 14px',
          textAlign: 'center',
          background: dragOver ? 'var(--primary-soft)' : '#fafbfc',
          marginBottom: 12,
          cursor: 'pointer'
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="small muted">
          {uploading
            ? 'Uploading…'
            : 'Drop files here or click to browse — PDF, DWG, DXF, STEP, images, etc.'}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <div className="small muted">No attachments yet.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10
          }}
        >
          {attachments.map((a) => {
            const image = isImageMime(a.mime_type);
            const inlineUrl = api.attachmentDownloadUrl(quoteId, a.id, true);
            const dlUrl = api.attachmentDownloadUrl(quoteId, a.id);
            return (
              <div
                key={a.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: '#fff',
                  padding: 10
                }}
              >
                <div
                  style={{
                    height: 110,
                    background: '#f0f2f5',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    marginBottom: 8
                  }}
                >
                  {image ? (
                    <a href={inlineUrl} target="_blank" rel="noreferrer" style={{ width: '100%', height: '100%' }}>
                      <img
                        src={inlineUrl}
                        alt={a.original_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </a>
                  ) : (
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        letterSpacing: 1
                      }}
                    >
                      {extIcon(a.original_name)}
                    </div>
                  )}
                </div>
                <div
                  className="small"
                  title={a.original_name}
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 500
                  }}
                >
                  {a.original_name}
                </div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  {fmtSize(a.size || 0)}
                </div>
                <div className="btn-row">
                  <a className="btn sm" href={dlUrl}>Download</a>
                  <a className="btn sm" href={inlineUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <button className="btn sm danger" onClick={() => onDelete(a.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
