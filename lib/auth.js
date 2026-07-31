const jwt = require("jsonwebtoken");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "90d" });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function getTokenFromRequest(req) {
  var header = (req.headers && req.headers.authorization) || "";
  var match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

module.exports = { signToken: signToken, verifyToken: verifyToken, getTokenFromRequest: getTokenFromRequest };
