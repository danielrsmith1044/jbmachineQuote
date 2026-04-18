async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      if (err.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Quotes
  listQuotes: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request(`/quotes${qs ? `?${qs}` : ''}`);
  },
  getQuote: (id) => request(`/quotes/${id}`),
  createQuote: (data) => request('/quotes', { method: 'POST', body: JSON.stringify(data) }),
  updateQuote: (id, data) => request(`/quotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuote: (id) => request(`/quotes/${id}`, { method: 'DELETE' }),
  duplicateQuote: (id) => request(`/quotes/${id}/duplicate`, { method: 'POST' }),
  pdfUrl: (id) => `/api/quotes/${id}/pdf`,

  // Attachments
  listAttachments: (quoteId) => request(`/quotes/${quoteId}/attachments`),
  uploadAttachments: async (quoteId, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch(`/api/quotes/${quoteId}/attachments`, {
      method: 'POST',
      body: fd
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const err = await res.json();
        if (err.error) msg = err.error;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
  deleteAttachment: (quoteId, attId) =>
    request(`/quotes/${quoteId}/attachments/${attId}`, { method: 'DELETE' }),
  attachmentDownloadUrl: (quoteId, attId, inline = false) =>
    `/api/quotes/${quoteId}/attachments/${attId}/download${inline ? '?inline=1' : ''}`,

  // Materials
  listMaterials: () => request('/materials'),
  getMaterial: (id) => request(`/materials/${id}`),
  createMaterial: (data) => request('/materials', { method: 'POST', body: JSON.stringify(data) }),
  updateMaterial: (id, data) => request(`/materials/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),
  seedStarterCatalog: () => request('/materials/seed', { method: 'POST' }),
  previewStarterCatalog: () => request('/materials/catalog/starter'),
  bulkImportMaterials: (materials, overwrite = false) =>
    request('/materials/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ materials, overwrite })
    }),

  // Settings
  getSettings: () => request('/settings'),
  saveSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Dashboard
  getDashboard: () => request('/dashboard')
};

export function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
