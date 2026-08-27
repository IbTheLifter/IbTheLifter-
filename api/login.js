const bcrypt = require("bcryptjs");
const { pathnameFor, normalizeIdentifier, readRecord, updateRecord } = require("../lib/store");
const { signToken } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }

  var body = req.body || {};
  var identifierType = body.identifierType;
  var identifier = body.identifier;
  var password = body.password;

  if ((identifierType !== "email" && identifierType !== "phone") || !identifier || !password) {
    res.status(400).json({ error: "INVALID_INPUT" });
    return;
  }

  var normalized = normalizeIdentifier(identifierType, identifier);
  var pathname = pathnameFor(normalized);

  var found;
  try {
    found = await readRecord(pathname);
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
    return;
  }
  if (!found) { res.status(404).json({ error: "NO_ACCOUNT" }); return; }

  var match = await bcrypt.compare(String(password), found.record.passwordHash);
  if (!match) { res.status(401).json({ error: "WRONG_PASSWORD" }); return; }

  // Accounts created before identifier/identifierType were added to the record
  // (or ones that only ever saw an old client) won't have it stored - backfill it
  // here so "Personal Details" has something to show from now on. Best-effort: if
  // this write loses a race, it'll just backfill again on the next login.
  //
  // Critical: this write changes the blob's etag. If we returned the stale
  // found.etag below, the client's very next /api/data save would immediately
  // 409 against it - the exact "every write permanently rejected" bug fixed
  // earlier this project. Must update found.etag to the write's real result.
  if (!found.record.identifier) {
    try {
      var backfilled = Object.assign({}, found.record, { identifierType: identifierType, identifier: normalized });
      var backfillResult = await updateRecord(pathname, backfilled, found.etag);
      found.etag = backfillResult.etag;
      found.record = backfilled;
    } catch (e) { /* non-critical - next login will retry */ }
  }

  var token = signToken({ sub: pathname, tv: found.record.tokenVersion });
  res.status(200).json({
    token: token,
    data: found.record.data,
    etag: found.etag,
    identifierType: found.record.identifierType || identifierType,
    identifier: found.record.identifier || normalized,
    fullName: found.record.fullName || ""
  });
};
