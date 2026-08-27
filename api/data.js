const { readRecord, updateRecord, BlobPreconditionFailedError } = require("../lib/store");
const { verifyToken, getTokenFromRequest } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

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
  var found;
  try {
    found = await readRecord(pathname);
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
    return;
  }
  if (!found) { res.status(401).json({ error: "INVALID_TOKEN" }); return; }
  if (found.record.tokenVersion !== payload.tv) { res.status(401).json({ error: "SESSION_REVOKED" }); return; }

  if (req.method === "GET") {
    res.status(200).json({
      data: found.record.data,
      etag: found.etag,
      identifierType: found.record.identifierType,
      identifier: found.record.identifier,
      fullName: found.record.fullName || ""
    });
    return;
  }

  if (req.method === "POST") {
    var body = req.body || {};
    if (body.data === undefined) { res.status(400).json({ error: "INVALID_INPUT" }); return; }
    var nextRecord = Object.assign({}, found.record, { data: body.data });
    try {
      var putResult = await updateRecord(pathname, nextRecord, body.etag);
      res.status(200).json({ ok: true, etag: putResult.etag });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) {
        res.status(409).json({ error: "CONFLICT" });
      } else {
        res.status(500).json({ error: "SERVER_ERROR" });
      }
    }
    return;
  }

  res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
};
