const crypto = require("crypto");
const { put, get } = require("@vercel/blob");

function pathnameFor(normalizedIdentifier) {
  const hash = crypto.createHash("sha256").update(normalizedIdentifier).digest("hex");
  return "users/" + hash + ".json";
}

function normalizeIdentifier(identifierType, identifier) {
  if (identifierType === "email") {
    return String(identifier).trim().toLowerCase();
  }
  // phone: client sends the full number already prefixed with the country dial code, e.g. "+1..."
  var digits = String(identifier).replace(/[^\d]/g, "");
  return "+" + digits;
}

async function readRecord(pathname) {
  var result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  var record = await new Response(result.stream).json();
  return { record: record, etag: result.blob.etag };
}

// Signup path: allowOverwrite defaults to false, so put() rejects if this pathname
// already exists. Since the pathname is a deterministic hash of the identifier, the
// only realistic reason this call fails is "an account with this identifier exists".
async function createRecord(pathname, record) {
  return put(pathname, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

// Data-update path: explicit allowOverwrite + optional ifMatch for optimistic concurrency.
// A mismatched ifMatch throws BlobPreconditionFailedError (imported by callers from @vercel/blob).
async function updateRecord(pathname, record, ifMatch) {
  return put(pathname, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    ifMatch: ifMatch,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });
}

module.exports = { pathnameFor: pathnameFor, normalizeIdentifier: normalizeIdentifier, readRecord: readRecord, createRecord: createRecord, updateRecord: updateRecord };
