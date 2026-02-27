"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/lambda/websocket/connect.ts
var connect_exports = {};
__export(connect_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(connect_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// lib/lambda/auth/jwt.ts
var import_crypto = require("crypto");
var JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
var REFRESH_TOKEN_EXPIRY = 30 * 24 * 3600;
function base64UrlDecode(data) {
  return Buffer.from(data, "base64url").toString();
}
function sign(payload, secret) {
  return (0, import_crypto.createHmac)("sha256", secret).update(payload).digest("base64url");
}
function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const expectedSignature = sign(`${header}.${payload}`, JWT_SECRET);
    if (signature !== expectedSignature) return null;
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (decoded.exp < Math.floor(Date.now() / 1e3)) return null;
    return decoded;
  } catch {
    return null;
  }
}

// lib/lambda/websocket/connect.ts
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE_NAME = process.env.TABLE_NAME;
async function handler(event) {
  const connectionId = event.requestContext.connectionId;
  const ticket = event.queryStringParameters?.ticket;
  if (!ticket) {
    return { statusCode: 401, body: "Missing ticket" };
  }
  const payload = verifyToken(ticket);
  if (!payload) {
    return { statusCode: 401, body: "Invalid ticket" };
  }
  const agentId = event.queryStringParameters?.agentId;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = Math.floor(Date.now() / 1e3) + 24 * 3600;
  await ddb.send(new import_lib_dynamodb.PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `CONN#${connectionId}`,
      SK: "META",
      GSI3PK: agentId ? `AGENT#${agentId}` : `USER#${payload.sub}`,
      GSI3SK: now,
      agentId: agentId || null,
      userId: payload.sub,
      connectedAt: now,
      lastActivity: now,
      TTL: expiresAt
    }
  }));
  return { statusCode: 200, body: "Connected" };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
