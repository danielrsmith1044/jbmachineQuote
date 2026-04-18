const express = require('express');
const { db } = require('../db');
const { loadQuote, calculateQuote } = require('../pricing');

const router = express.Router();

router.get('/', (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const countsByStatus = db
    .prepare('SELECT status, COUNT(*) AS n FROM quotes GROUP BY status')
    .all();
  const monthly = db
    .prepare('SELECT COUNT(*) AS n FROM quotes WHERE date >= ?')
    .get(monthStart);
  const total = db.prepare('SELECT COUNT(*) AS n FROM quotes').get();
  const accepted = countsByStatus.find((r) => r.status === 'Accepted')?.n || 0;
  const declined = countsByStatus.find((r) => r.status === 'Declined')?.n || 0;
  const decided = accepted + declined;
  const acceptanceRate = decided > 0 ? accepted / decided : 0;

  const topCustomers = db
    .prepare(
      `SELECT customer_name, COUNT(*) AS quote_count
       FROM quotes
       WHERE customer_name IS NOT NULL AND customer_name <> ''
       GROUP BY customer_name
       ORDER BY quote_count DESC, customer_name
       LIMIT 5`
    )
    .all();

  const recent = db
    .prepare(
      `SELECT id, reference, customer_name, job_name, date, status
       FROM quotes ORDER BY date DESC, id DESC LIMIT 10`
    )
    .all();

  // Pipeline value = sum of first-tier totals for non-declined quotes this month
  const monthQuotes = db
    .prepare('SELECT id FROM quotes WHERE date >= ?')
    .all(monthStart);
  let monthValue = 0;
  for (const { id } of monthQuotes) {
    const q = loadQuote(id);
    if (!q) continue;
    const pricing = calculateQuote(q);
    monthValue += pricing.rows[0]?.total || 0;
  }

  res.json({
    total_quotes: total.n,
    month_quotes: monthly.n,
    month_value: monthValue,
    counts_by_status: countsByStatus,
    acceptance_rate: acceptanceRate,
    accepted,
    declined,
    top_customers: topCustomers,
    recent
  });
});

module.exports = router;
