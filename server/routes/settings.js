const express = require('express');
const { allSettings, setSetting } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(allSettings());
});

router.put('/', (req, res) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    setSetting(k, v);
  }
  res.json(allSettings());
});

module.exports = router;
