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

// lib/lambda/websocket/message.ts
var message_exports = {};
__export(message_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(message_exports);
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var import_client_apigatewaymanagementapi = require("@aws-sdk/client-apigatewaymanagementapi");
var ddb = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}));
var TABLE_NAME = process.env.TABLE_NAME;
async function handler(event) {
  const connectionId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;
  const endpoint = `https://${domainName}/${stage}`;
  const apiGw = new import_client_apigatewaymanagementapi.ApiGatewayManagementApiClient({ endpoint });
  try {
    const message = JSON.parse(event.body || "{}");
    const conn = await ddb.send(new import_lib_dynamodb.GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CONN#${connectionId}`, SK: "META" }
    }));
    if (!conn.Item) {
      return { statusCode: 401, body: "Connection not found" };
    }
    switch (message.type) {
      case "ping":
        await sendToConnection(apiGw, connectionId, { type: "pong" });
        break;
      case "broadcast":
        if (conn.Item.agentId) {
          await broadcastToAgent(apiGw, conn.Item.agentId, message.payload, connectionId);
        }
        break;
      default:
        await sendToConnection(apiGw, connectionId, {
          type: "error",
          payload: { message: "Unknown message type" }
        });
    }
    return { statusCode: 200, body: "OK" };
  } catch (error) {
    console.error("Message handler error:", error);
    return { statusCode: 500, body: "Internal error" };
  }
}
async function sendToConnection(apiGw, connectionId, data) {
  try {
    await apiGw.send(new import_client_apigatewaymanagementapi.PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data))
    }));
    return true;
  } catch (error) {
    if (error instanceof import_client_apigatewaymanagementapi.GoneException) {
      await ddb.send(new import_lib_dynamodb.DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CONN#${connectionId}`, SK: "META" }
      }));
    }
    return false;
  }
}
async function broadcastToAgent(apiGw, agentId, payload, excludeConnectionId) {
  const connections = await ddb.send(new import_lib_dynamodb.QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk",
    ExpressionAttributeValues: { ":pk": `AGENT#${agentId}` }
  }));
  const message = { type: "broadcast", payload };
  for (const conn of connections.Items || []) {
    const connId = conn.PK.replace("CONN#", "");
    if (connId !== excludeConnectionId) {
      await sendToConnection(apiGw, connId, message);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
