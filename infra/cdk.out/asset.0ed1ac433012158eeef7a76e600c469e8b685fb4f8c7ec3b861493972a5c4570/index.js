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

// lib/lambda/api/user.ts
var user_exports = {};
__export(user_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(user_exports);

// lib/database/service.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var DatabaseService = class {
  client;
  tableName;
  constructor(tableName) {
    this.tableName = tableName || process.env.TABLE_NAME;
    this.client = import_lib_dynamodb.DynamoDBDocumentClient.from(new import_client_dynamodb.DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true }
    });
  }
  async get(key) {
    const result = await this.client.send(new import_lib_dynamodb.GetCommand({
      TableName: this.tableName,
      Key: key
    }));
    return result.Item || null;
  }
  async put(item) {
    await this.client.send(new import_lib_dynamodb.PutCommand({
      TableName: this.tableName,
      Item: item
    }));
    return item;
  }
  async update(key, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    Object.entries(updates).forEach(([k, v]) => {
      if (k !== "PK" && k !== "SK" && v !== void 0) {
        const attrName = `#${k}`;
        const attrValue = `:${k}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = k;
        expressionAttributeValues[attrValue] = v;
      }
    });
    if (updateExpressions.length === 0) return this.get(key);
    const result = await this.client.send(new import_lib_dynamodb.UpdateCommand({
      TableName: this.tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW"
    }));
    return result.Attributes || null;
  }
  async delete(key) {
    await this.client.send(new import_lib_dynamodb.DeleteCommand({
      TableName: this.tableName,
      Key: key
    }));
  }
  async query(keyCondition, keyValues, options = {}) {
    const params = {
      TableName: this.tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: { ...keyValues, ...options.expressionAttributeValues },
      IndexName: options.indexName,
      Limit: options.limit,
      ScanIndexForward: options.scanForward ?? true,
      ExclusiveStartKey: options.exclusiveStartKey,
      FilterExpression: options.filterExpression,
      ExpressionAttributeNames: options.expressionAttributeNames
    };
    const result = await this.client.send(new import_lib_dynamodb.QueryCommand(params));
    return {
      items: result.Items || [],
      lastKey: result.LastEvaluatedKey
    };
  }
  async queryByPK(pk, options = {}) {
    return this.query("PK = :pk", { ":pk": pk }, options);
  }
  async queryByGSI(indexName, pkName, pkValue, options = {}) {
    return this.query(
      `${pkName} = :pk`,
      { ":pk": pkValue },
      { ...options, indexName }
    );
  }
};
var dbInstance = null;
function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}

// lib/database/schema.ts
var Keys = {
  user: (userId) => ({ PK: `USER#${userId}`, SK: "PROFILE" }),
  session: (sessionId) => ({ PK: `SESSION#${sessionId}`, SK: "META" }),
  app: (appId) => ({ PK: `APP#${appId}`, SK: "META" }),
  agent: (agentId) => ({ PK: `AGENT#${agentId}`, SK: "STATE" }),
  message: (agentId, timestamp, messageId) => ({
    PK: `AGENT#${agentId}`,
    SK: `MSG#${timestamp}#${messageId}`
  }),
  connection: (connectionId) => ({ PK: `CONN#${connectionId}`, SK: "META" }),
  rateLimit: (identifier, endpoint, windowStart) => ({
    PK: `RATE#${identifier}#${endpoint}`,
    SK: `WINDOW#${windowStart}`
  })
};

// lib/database/user-service.ts
async function getUserById(userId) {
  const db = getDb();
  return db.get(Keys.user(userId));
}
async function updateUser(userId, input) {
  const db = getDb();
  return db.update(Keys.user(userId), {
    ...input,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// lib/lambda/api/user.ts
var corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};
function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}
async function handler(event) {
  const userId = event.requestContext.authorizer?.userId;
  if (!userId) return response(401, { error: "Unauthorized" });
  const method = event.httpMethod;
  try {
    if (method === "GET") {
      const user = await getUserById(userId);
      if (!user) return response(404, { error: "User not found" });
      return response(200, {
        id: userId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences ? JSON.parse(user.preferences) : null
      });
    }
    if (method === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const updates = {};
      if (body.displayName) updates.displayName = body.displayName;
      if (body.avatarUrl !== void 0) updates.avatarUrl = body.avatarUrl;
      if (body.preferences !== void 0) updates.preferences = JSON.stringify(body.preferences);
      const user = await updateUser(userId, updates);
      if (!user) return response(404, { error: "User not found" });
      return response(200, {
        id: userId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences ? JSON.parse(user.preferences) : null
      });
    }
    return response(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("User handler error:", error);
    return response(500, { error: "Internal error" });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
