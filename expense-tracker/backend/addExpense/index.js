/**
 * AWS Lambda Function: addExpense
 * Runtime: Node.js 18.x or Node.js 20.x
 *
 * Responsibility: Validates incoming expense data and writes a new record into Amazon DynamoDB.
 * The userId is extracted from the Cognito Authorizer claim (or fallback for local/console testing).
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// Initialize DynamoDB Document Client (uses AWS SDK v3 pre-bundled in Node.js 18.x/20.x)
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
  console.log("addExpense invoked with event:", JSON.stringify(event));

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
    // Priority: API Gateway Cognito Authorizer claim -> Header fallback -> Query param
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

    // 2. Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Bad Request: Request body is missing" })
      };
    }

    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Bad Request: Invalid JSON body" })
      };
    }

    const { title, amount, category, date } = body;

    // 3. Validate required fields
    if (!title || typeof title !== "string" || title.trim() === "") {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Validation Error: 'title' is required" })
      };
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Validation Error: 'amount' must be a positive number" })
      };
    }

    const validCategories = ["Food", "Travel", "Shopping", "Education", "Other"];
    if (!category || !validCategories.includes(category)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ 
          message: `Validation Error: 'category' must be one of: ${validCategories.join(", ")}` 
        })
      };
    }

    if (!date || isNaN(Date.parse(date))) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Validation Error: 'date' must be a valid date (YYYY-MM-DD)" })
      };
    }

    // 4. Construct unique expense item
    const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newExpense = {
      userId: userId,
      expenseId: expenseId,
      title: title.trim(),
      amount: parsedAmount,
      category: category,
      date: date,
      createdAt: new Date().toISOString()
    };

    // 5. Save item to Amazon DynamoDB
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: newExpense
    });

    await docClient.send(putCommand);

    return {
      statusCode: 201,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Expense added successfully",
        expense: newExpense
      })
    };

  } catch (error) {
    console.error("Error in addExpense Lambda:", error);
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
