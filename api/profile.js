const { readRecord, updateRecord } = require("../lib/store");
const { verifyToken, getTokenFromRequest } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }

  var token = getTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "NO_TOKEN" }); return; }

  var payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }

  var pathname = payload.sub;
  var body = req.body || {};
  var fullName = body.fullName ? String(body.fullName).trim().replace(/\s+/g, " ") : "";

  if (!fullName) {
    res.status(400).json({ error: "INVALID_INPUT" });
    return;
  }

  try {
    var recordObj = await readRecord(pathname);
    if (!recordObj) { res.status(404).json({ error: "NO_ACCOUNT" }); return; }

    var nextRecord = Object.assign({}, recordObj.record, { fullName: fullName });
    var putResult = await updateRecord(pathname, nextRecord, recordObj.etag);
    res.status(200).json({ ok: true, etag: putResult.etag, fullName: fullName });
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
};
