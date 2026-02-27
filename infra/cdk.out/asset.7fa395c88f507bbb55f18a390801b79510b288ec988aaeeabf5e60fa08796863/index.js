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

// lib/lambda/auth/session.ts
var session_exports = {};
__export(session_exports, {
  refreshHandler: () => refreshHandler,
  revokeAllHandler: () => revokeAllHandler,
  revokeHandler: () => revokeHandler
});
module.exports = __toCommonJS(session_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");

// lib/lambda/auth/jwt.ts
var import_crypto = require("crypto");
var JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
var TOKEN_EXPIRY = 3600;
var REFRESH_TOKEN_EXPIRY = 30 * 24 * 3600;
function base64UrlEncode(data) {
  return Buffer.from(data).toString("base64url");
}
function base64UrlDecode(data) {
  return Buffer.from(data, "base64url").toString();
}
function sign(payload, secret) {
  return (0, import_crypto.createHmac)("sha256", secret).update(payload).digest("base64url");
}
function generateToken(userId, email, type = "access") {
  const now = Math.floor(Date.now() / 1e3);
  const expiry = type === "access" ? TOKEN_EXPIRY : REFRESH_TOKEN_EXPIRY;
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    sub: userId,
    email,
    exp: now + expiry,
    iat: now,
    type
  }));
  const signature = sign(`${header}.${payload}`, JWT_SECRET);
  return `${header}.${payload}.${signature}`;
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
function hashToken(token) {
  return (0, import_crypto.createHmac)("sha256", JWT_SECRET).update(token).digest("hex");
}
function generateSessionId() {
  return (0, import_crypto.randomBytes)(32).toString("hex");
}

// lib/lambda/auth/session.ts
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE_NAME = process.env.TABLE_NAME;
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
}
async function refreshHandler(event) {
  try {
    const cookies = parseCookies(event.headers.Cookie || event.headers.cookie);
    const refreshToken = cookies.refresh_token;
    const sessionId = cookies.session_id;
    if (!refreshToken || !sessionId) {
      return { statusCode: 401, body: JSON.stringify({ error: "Missing tokens" }) };
    }
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid refresh token" }) };
    }
    const session = await ddb.send(new import_lib_dynamodb.GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SESSION#${sessionId}`, SK: "META" }
    }));
    if (!session.Item || session.Item.refreshTokenHash !== hashToken(refreshToken)) {
      return { statusCode: 401, body: JSON.stringify({ error: "Session invalid" }) };
    }
    const newSessionId = generateSessionId();
    const newAccessToken = generateToken(payload.sub, payload.email, "access");
    const newRefreshToken = generateToken(payload.sub, payload.email, "refresh");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const expiresAt = Math.floor(Date.now() / 1e3) + 30 * 24 * 3600;
    await ddb.send(new import_lib_dynamodb.DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SESSION#${sessionId}`, SK: "META" }
    }));
    await ddb.send(new import_lib_dynamodb.PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `SESSION#${newSessionId}`,
        SK: "META",
        GSI2PK: `USER#${payload.sub}`,
        GSI2SK: now,
        userId: payload.sub,
        accessTokenHash: hashToken(newAccessToken),
        refreshTokenHash: hashToken(newRefreshToken),
        createdAt: now,
        TTL: expiresAt
      }
    }));
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": [
          `access_token=${newAccessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
          `refresh_token=${newRefreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`,
          `session_id=${newSessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`
        ].join(", ")
      },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error("Refresh error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
}
async function revokeHandler(event) {
  try {
    const cookies = parseCookies(event.headers.Cookie || event.headers.cookie);
    const sessionId = cookies.session_id;
    if (sessionId) {
      await ddb.send(new import_lib_dynamodb.DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `SESSION#${sessionId}`, SK: "META" }
      }));
    }
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": [
          "access_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          "refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          "session_id=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
        ].join(", ")
      },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error("Revoke error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
}
async function revokeAllHandler(event) {
  try {
    const cookies = parseCookies(event.headers.Cookie || event.headers.cookie);
    const accessToken = cookies.access_token;
    if (!accessToken) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    const payload = verifyToken(accessToken);
    if (!payload) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid token" }) };
    }
    const sessions = await ddb.send(new import_lib_dynamodb.QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${payload.sub}` }
    }));
    for (const session of sessions.Items || []) {
      await ddb.send(new import_lib_dynamodb.DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: session.PK, SK: session.SK }
      }));
    }
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": [
          "access_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          "refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
          "session_id=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
        ].join(", ")
      },
      body: JSON.stringify({ success: true, revokedCount: sessions.Items?.length || 0 })
    };
  } catch (error) {
    console.error("Revoke all error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal error" }) };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  refreshHandler,
  revokeAllHandler,
  revokeHandler
});
