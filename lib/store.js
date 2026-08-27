const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

class BlobPreconditionFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlobPreconditionFailedError";
  }
}

function pathnameFor(normalizedIdentifier) {
  const hash = crypto.createHash("sha256").update(normalizedIdentifier).digest("hex");
  return "users/" + hash + ".json";
}

function normalizeIdentifier(identifierType, identifier) {
  if (identifierType === "email") {
    return String(identifier).trim().toLowerCase();
  }
  var digits = String(identifier).replace(/[^\d]/g, "");
  return "+" + digits;
}

async function readRecord(pathname) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(pathname)}`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!res.ok) return null;
    const list = await res.json();
    if (!list || list.length === 0) return null;
    const row = list[0];
    return { record: row.record, etag: row.etag };
  } catch (e) {
    return null;
  }
}

async function createRecord(pathname, record) {
  const etag = crypto.randomBytes(16).toString("hex");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: "POST",
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      id: pathname,
      record: record,
      etag: etag
    })
  });
  if (!res.ok) {
    throw new Error("Conflict or write failed");
  }
  const list = await res.json();
  return { etag: list[0].etag };
}

async function updateRecord(pathname, record, ifMatch) {
  const nextEtag = crypto.randomBytes(16).toString("hex");
  let url = `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(pathname)}`;
  if (ifMatch) {
    url += `&etag=eq.${encodeURIComponent(ifMatch)}`;
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      record: record,
      etag: nextEtag,
      updated_at: new Date().toISOString()
    })
  });
  if (!res.ok) {
    throw new Error("Update failed");
  }
  const list = await res.json();
  if (!list || list.length === 0) {
    throw new BlobPreconditionFailedError("Precondition failed");
  }
  return { etag: list[0].etag };
}

async function listAllRecords() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id,record,etag`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!res.ok) return [];
    const list = await res.json();
    return list.map(row => ({
      pathname: row.id,
      record: row.record,
      etag: row.etag
    }));
  } catch (e) {
    return [];
  }
}

module.exports = {
  pathnameFor,
  normalizeIdentifier,
  readRecord,
  createRecord,
  updateRecord,
  listAllRecords,
  BlobPreconditionFailedError
};
