'use strict';

const express = require('express');
const mirrorService = require('../../services/mirrorService.cjs');

const router = express.Router();

router.get('/:kind/packages', async (req, res, next) => {
  try {
    res.json(await mirrorService.listMirroredPackages(req.params.kind));
  } catch (err) {
    next(err);
  }
});

router.post('/oci/import', async (req, res, next) => {
  try {
    res.json(await mirrorService.importOciImage(req.body.imageRef));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
