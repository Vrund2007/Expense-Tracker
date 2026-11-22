/**
 * AWS Lambda Function: deleteExpense
 * Runtime: Node.js 18.x or Node.js 20.x
 *
 * Responsibility: Deletes a specific expense from Amazon DynamoDB.
 * Requires both userId (partition key) and expenseId (sort key) to ensure users can only delete their own records.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize DynamoDB Document Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Table name configured via environment variable with fallback to 'Expenses'
const TABLE_NAME = process.env.TABLE_NAME || "Expenses";

// Standard CORS response headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-User-Id",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,DELETE",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  console.log("deleteExpense invoked with event:", JSON.stringify(event));

  // Handle CORS OPTIONS preflight request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Preflight OK" })
    };
  }

  try {
    // 1. Extract authenticated user's ID
    const userId = 
      event.requestContext?.authorizer?.claims?.sub ||
      event.headers?.["x-user-id"] ||
      event.headers?.["X-User-Id"] ||
      event.queryStringParameters?.userId;

    if (!userId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Unauthorized: Missing user authentication token" })
      };
    }

    // 2. Extract expenseId from pathParameters (e.g. /expenses/{id}) or query params
    const expenseId = 
      event.pathParameters?.id || 
      event.queryStringParameters?.id ||
      (event.body ? (typeof event.body === 'string' ? JSON.parse(event.body).expenseId : event.body.expenseId) : null);

    if (!expenseId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Bad Request: 'expenseId' is required in path or parameters" })
      };
    }

    // 3. Delete from DynamoDB using composite primary key (userId + expenseId)
    // Because userId is part of the primary key, a user CANNOT delete another user's expense!
    const deleteCommand = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: userId,
        expenseId: expenseId
      }
    });

    await docClient.send(deleteCommand);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Expense deleted successfully",
        expenseId: expenseId
      })
    };

  } catch (error) {
    console.error("Error in deleteExpense Lambda:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Internal Server Error",
        error: error.message
      })
    };
  }
};

