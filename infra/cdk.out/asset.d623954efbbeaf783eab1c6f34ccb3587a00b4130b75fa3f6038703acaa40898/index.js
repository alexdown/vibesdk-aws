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

// lib/lambda/auth/oauth-callback.ts
var oauth_callback_exports = {};
__export(oauth_callback_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(oauth_callback_exports);
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
function hashToken(token) {
  return (0, import_crypto.createHmac)("sha256", JWT_SECRET).update(token).digest("hex");
}
function generateSessionId() {
  return (0, import_crypto.randomBytes)(32).toString("hex");
}

// lib/lambda/auth/oauth-callback.ts
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE_NAME = process.env.TABLE_NAME;
var COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;
var CLIENT_ID = process.env.CLIENT_ID;
var CLIENT_SECRET = process.env.CLIENT_SECRET;
var REDIRECT_URI = process.env.REDIRECT_URI;
var FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
async function exchangeCodeForTokens(code) {
  const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    })
  });
  if (!response.ok) throw new Error("Token exchange failed");
  return response.json();
}
async function getUserInfo(accessToken) {
  const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/userInfo`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error("Failed to get user info");
  return response.json();
}
async function findOrCreateUser(userInfo) {
  const result = await ddb.send(new import_lib_dynamodb.QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :email",
    ExpressionAttributeValues: { ":email": userInfo.email },
    Limit: 1
  }));
  if (result.Items?.[0]) {
    return result.Items[0].PK.replace("USER#", "");
  }
  const userId = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await ddb.send(new import_lib_dynamodb.PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `USER#${userId}`,
      SK: "PROFILE",
      GSI1PK: userInfo.email,
      GSI1SK: now,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email.split("@")[0],
      avatarUrl: userInfo.picture,
      provider: "cognito",
      providerId: userInfo.sub,
      createdAt: now,
      updatedAt: now
    }
  }));
  return userId;
}
async function createSession(userId, email) {
  const sessionId = generateSessionId();
  const accessToken = generateToken(userId, email, "access");
  const refreshToken = generateToken(userId, email, "refresh");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = Math.floor(Date.now() / 1e3) + 30 * 24 * 3600;
  await ddb.send(new import_lib_dynamodb.PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `SESSION#${sessionId}`,
      SK: "META",
      GSI2PK: `USER#${userId}`,
      GSI2SK: now,
      userId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      createdAt: now,
      TTL: expiresAt
    }
  }));
  return { accessToken, refreshToken, sessionId };
}
async function handler(event) {
  try {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;
    if (!code) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing code" }) };
    }
    let returnTo = "/";
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
        returnTo = decoded.returnTo || "/";
      } catch {
      }
    }
    const tokens = await exchangeCodeForTokens(code);
    const userInfo = await getUserInfo(tokens.access_token);
    const userId = await findOrCreateUser(userInfo);
    const session = await createSession(userId, userInfo.email);
    const redirectUrl = new URL(returnTo, FRONTEND_URL);
    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl.toString(),
        "Set-Cookie": [
          `access_token=${session.accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
          `refresh_token=${session.refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`,
          `session_id=${session.sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`
        ].join(", ")
      },
      body: ""
    };
  } catch (error) {
    console.error("OAuth callback error:", error);
    return {
      statusCode: 302,
      headers: { Location: `${FRONTEND_URL}/auth/error` },
      body: ""
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
