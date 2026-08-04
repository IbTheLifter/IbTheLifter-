const bcrypt = require("bcryptjs");
const { readRecord, updateRecord } = require("../lib/store");
const { verifyToken, signToken, getTokenFromRequest } = require("../lib/auth");
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

  var body = req.body || {};
  var currentPassword = body.currentPassword;
  var newPassword = body.newPassword;
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: "INVALID_INPUT" });
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

  var match = await bcrypt.compare(String(currentPassword), found.record.passwordHash);
  if (!match) { res.status(401).json({ error: "WRONG_PASSWORD" }); return; }

  var newHash = await bcrypt.hash(String(newPassword), 10);
  var nextTokenVersion = found.record.tokenVersion + 1;
  var nextRecord = Object.assign({}, found.record, {
    passwordHash: newHash,
    tokenVersion: nextTokenVersion
  });

  try {
    await updateRecord(pathname, nextRecord, found.etag);
  } catch (e) {
    res.status(409).json({ error: "CONFLICT" });
    return;
  }

  // Issue a fresh token bound to the new tokenVersion so this session stays logged
  // in; any other device's token (still on the old tokenVersion) is now invalid.
  var newToken = signToken({ sub: pathname, tv: nextTokenVersion });
  res.status(200).json({ token: newToken });
};
