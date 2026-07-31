const bcrypt = require("bcryptjs");
const { pathnameFor, normalizeIdentifier, readRecord } = require("../lib/store");
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

  var token = signToken({ sub: pathname, tv: found.record.tokenVersion });
  res.status(200).json({ token: token, data: found.record.data, etag: found.etag });
};
