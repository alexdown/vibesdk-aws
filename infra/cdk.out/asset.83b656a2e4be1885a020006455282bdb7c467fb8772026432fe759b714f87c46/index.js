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

// lib/lambda/websocket/disconnect.ts
var disconnect_exports = {};
__export(disconnect_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(disconnect_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE_NAME = process.env.TABLE_NAME;
async function handler(event) {
  const connectionId = event.requestContext.connectionId;
  await ddb.send(new import_lib_dynamodb.DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CONN#${connectionId}`, SK: "META" }
  }));
  return { statusCode: 200, body: "Disconnected" };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
