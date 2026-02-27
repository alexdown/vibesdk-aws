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

// lib/lambda/auth/authorizer.ts
var authorizer_exports = {};
__export(authorizer_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(authorizer_exports);
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
function hashToken(token) {
  return (0, import_crypto.createHmac)("sha256", JWT_SECRET).update(token).digest("hex");
}

// lib/lambda/auth/authorizer.ts
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
function generatePolicy(principalId, effect, resource, context) {
  return {
    principalId,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resource
      }]
    },
    context
  };
}
async function handler(event) {
  try {
    let token;
    let sessionId;
    if (event.authorizationToken?.startsWith("Bearer ")) {
      token = event.authorizationToken.slice(7);
    } else if (event.authorizationToken) {
      const cookies = parseCookies(event.authorizationToken);
      token = cookies.access_token;
      sessionId = cookies.session_id;
    }
    if (!token) {
      return generatePolicy("anonymous", "Deny", event.methodArn);
    }
    const payload = verifyToken(token);
    if (!payload || payload.type !== "access") {
      return generatePolicy("anonymous", "Deny", event.methodArn);
    }
    if (sessionId) {
      const session = await ddb.send(new import_lib_dynamodb.GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `SESSION#${sessionId}`, SK: "META" }
      }));
      if (!session.Item || session.Item.accessTokenHash !== hashToken(token)) {
        return generatePolicy("anonymous", "Deny", event.methodArn);
      }
    }
    return generatePolicy(payload.sub, "Allow", event.methodArn, {
      userId: payload.sub,
      email: payload.email
    });
  } catch (error) {
    console.error("Authorizer error:", error);
    return generatePolicy("anonymous", "Deny", event.methodArn);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
