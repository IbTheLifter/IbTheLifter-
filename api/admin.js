const { readRecord, updateRecord, listAllRecords, BlobPreconditionFailedError } = require("../lib/store");
const { verifyToken, getTokenFromRequest } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

// The one and only admin email (normalized to lowercase)
var ADMIN_EMAIL = "ibraheemqasem03@gmail.com";

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Verify JWT token
  var token = getTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "NO_TOKEN" }); return; }

  var payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    res.status(401).json({ error: "INVALID_TOKEN" });
    return;
  }

  // Verify the caller is the admin by reading their record
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

  // Check admin identity
  var callerIdentifier = (found.record.identifier || "").toLowerCase();
  if (callerIdentifier !== ADMIN_EMAIL) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  // GET /api/admin — list all users
  if (req.method === "GET") {
    try {
      var allRecords = await listAllRecords();
      var users = allRecords.map(function(r) {
        return {
          pathname: r.pathname,
          identifier: r.record.identifier || "",
          identifierType: r.record.identifierType || "email",
          fullName: r.record.fullName || "",
          data: r.record.data || {}
        };
      });
      res.status(200).json({ users: users });
    } catch (e) {
      res.status(500).json({ error: "SERVER_ERROR" });
    }
    return;
  }

  // POST /api/admin — save a comment on a user's exercise
  if (req.method === "POST") {
    var body = req.body || {};
    var targetPathname = body.userPathname;
    var exerciseId = body.exerciseId;
    var commentText = body.commentText;

    if (!targetPathname || !exerciseId || commentText === undefined) {
      res.status(400).json({ error: "INVALID_INPUT" });
      return;
    }

    try {
      var targetRecord = await readRecord(targetPathname);
      if (!targetRecord) { res.status(404).json({ error: "USER_NOT_FOUND" }); return; }

      var nextData = Object.assign({}, targetRecord.record.data || {});
      if (!nextData.adminComments) nextData.adminComments = {};
      nextData.adminComments[exerciseId] = {
        text: String(commentText),
        timestamp: new Date().toISOString()
      };

      var nextRecord = Object.assign({}, targetRecord.record, { data: nextData });
      var putResult = await updateRecord(targetPathname, nextRecord, targetRecord.etag);
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
