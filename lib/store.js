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
  // get() reports the ETag with a weak-validator "W/" prefix, but put()'s ifMatch
  // precondition compares against the strong form and rejects the prefixed value
  // outright - every write using an etag straight from a read would 409 forever.
  // Strip it so the value we hand back to callers always round-trips through ifMatch.
  var etag = result.blob.etag ? result.blob.etag.replace(/^W\//, "") : result.blob.etag;
  return { record: record, etag: etag };
}

// Signup path: allowOverwrite defaults to false, so put() rejects if this pathname
// already exists. Since the pathname is a deterministic hash of the identifier, the
// only realistic reason this call fails is "an account with this identifier exists".
async function createRecord(pathname, record) {
  return put(pathname, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    // 0, not some positive TTL: a CDN-cached read within the TTL window comes back
    // with a weak ETag, which can never satisfy the strict ifMatch precondition below -
    // permanently 409ing every future write for that user until the cache expires.
    cacheControlMaxAge: 0
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
    cacheControlMaxAge: 0
  });
}

module.exports = { pathnameFor: pathnameFor, normalizeIdentifier: normalizeIdentifier, readRecord: readRecord, createRecord: createRecord, updateRecord: updateRecord };
