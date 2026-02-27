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

// lib/lambda/auth/oauth-initiate.ts
var oauth_initiate_exports = {};
__export(oauth_initiate_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(oauth_initiate_exports);
var COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;
var CLIENT_ID = process.env.CLIENT_ID;
var REDIRECT_URI = process.env.REDIRECT_URI;
async function handler(event) {
  const provider = event.pathParameters?.provider;
  if (!provider || !["google", "github"].includes(provider)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid provider" })
    };
  }
  const state = Buffer.from(JSON.stringify({
    returnTo: event.queryStringParameters?.returnTo || "/",
    timestamp: Date.now()
  })).toString("base64url");
  const authUrl = new URL(`https://${COGNITO_DOMAIN}/oauth2/authorize`);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "email openid profile");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("identity_provider", provider === "google" ? "Google" : "GitHub");
  return {
    statusCode: 302,
    headers: { Location: authUrl.toString() },
    body: ""
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
