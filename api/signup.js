const bcrypt = require("bcryptjs");
const { pathnameFor, normalizeIdentifier, createRecord } = require("../lib/store");
const { signToken } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }

  var body = req.body || {};
  var identifierType = body.identifierType;
  var identifier = body.identifier;
  var password = body.password;

  if ((identifierType !== "email" && identifierType !== "phone") || !identifier || !password || String(password).length < 6) {
    res.status(400).json({ error: "INVALID_INPUT" });
    return;
  }

  var normalized = normalizeIdentifier(identifierType, identifier);
  var pathname = pathnameFor(normalized);
  var passwordHash = await bcrypt.hash(String(password), 10);
  var record = { passwordHash: passwordHash, tokenVersion: 1, data: {}, createdAt: new Date().toISOString() };

  var putResult;
  try {
    putResult = await createRecord(pathname, record);
  } catch (e) {
    res.status(409).json({ error: "ACCOUNT_EXISTS" });
    return;
  }

  var token = signToken({ sub: pathname, tv: 1 });
  res.status(200).json({ token: token, data: {}, etag: putResult.etag });
};
