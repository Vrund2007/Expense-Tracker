# Simple Serverless Personal Expense Tracker

A lightweight, minimal, and beginner-friendly Personal Expense Tracker web application built using **HTML5, CSS3, and Vanilla JavaScript**, integrated with **AWS Serverless Services** (Amazon S3, Amazon API Gateway, AWS Lambda, Amazon DynamoDB, Amazon Cognito, and AWS IAM).

Designed specifically for college semester projects, cloud computing lab assignments, and serverless demonstrations.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Folder Structure](#2-folder-structure)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Amazon DynamoDB Table Structure](#4-amazon-dynamodb-table-structure)
5. [Amazon API Gateway Endpoints](#5-amazon-api-gateway-endpoints)
6. [AWS Lambda Functions](#6-aws-lambda-functions)
7. [Amazon Cognito Setup](#7-amazon-cognito-setup)
8. [AWS IAM Permissions & Policy](#8-aws-iam-permissions--policy)
9. [Step-by-Step AWS Deployment Guide](#9-step-by-step-aws-deployment-guide)
10. [Connecting Frontend to AWS](#10-connecting-frontend-to-aws)
11. [Testing & Local Demo Mode](#11-testing--local-demo-mode)
12. [College Viva & Academic Q&A](#12-college-viva--academic-qa)

---

## Live Deployed AWS Endpoints

| Resource | Value / URL |
| :--- | :--- |
| **AWS Region** | `ap-southeast-2` (Asia Pacific - Sydney) |
| **S3 Public Website URL** | [http://expense-tracker-134911380977.s3-website-ap-southeast-2.amazonaws.com](http://expense-tracker-134911380977.s3-website-ap-southeast-2.amazonaws.com) |
| **API Gateway Invoke URL** | `https://3v4p2ugf99.execute-api.ap-southeast-2.amazonaws.com/prod` |
| **DynamoDB Table** | `Expenses` (Partition Key: `userId`, Sort Key: `expenseId`) |
| **Cognito User Pool ID** | `ap-southeast-2_X0a0AkHFh` |
| **Cognito App Client ID** | `7u53m9mnp5d0cfntuna4lo5fq4` |
| **Lambda Functions** | `addExpense`, `getExpenses`, `deleteExpense` (Node.js 20.x) |

---

## 1. Project Overview

The **Serverless Personal Expense Tracker** allows authenticated users to:
- **Track Expenses in ₹ (INR):** Enter title, amount, category, and date.
- **View Dashboard:** View monthly spending total, total transaction count, and recent transactions.
- **Expense History:** Review all transactions in a clean table and delete unwanted items.
- **Strict User Isolation:** Each user's expenses are keyed by their unique Cognito User ID (`sub`), ensuring privacy.
- **100% Serverless:** No server maintenance, pay-per-use, automatically scales, and stays within the **AWS Free Tier**.

---

## 2. Folder Structure

```text
expense-tracker/
│
├── frontend/
│   ├── index.html        # Clean semantic HTML5 single-page interface
│   ├── style.css         # Modern, minimal styling with subtle purple accents
│   └── script.js         # Vanilla JavaScript handling UI, Fetch API & Cognito
│
├── backend/
│   ├── addExpense/
│   │   └── index.js      # Lambda to validate & insert an expense to DynamoDB
│   ├── getExpenses/
│   │   └── index.js      # Lambda to query a user's expenses from DynamoDB
│   └── deleteExpense/
│       └── index.js      # Lambda to delete an expense by composite key
│
└── README.md             # Complete architecture, setup & deployment documentation
```

---

## 3. Architecture Diagram

```
+-------------------------------------------------------------------------+
|                              USER BROWSER                               |
|        (Static HTML5 / CSS3 / Vanilla JavaScript Hosted on Amazon S3)   |
+-------------------+-----------------------------------+-----------------+
                    | 1. Authenticate                   | 3. REST Calls with
                    v                                   |    JWT ID Token
+-------------------------------+                       v
|         Amazon Cognito        |       +-------------------------------+
|           User Pool           |       |      Amazon API Gateway       |
| (Registration, Login, Tokens) |       |  (REST API with Authorizer)   |
+-------------------------------+       +---------------+---------------+
                                                        |
                                +-----------------------+-----------------------+
                                |                       |                       |
                     POST /expenses           GET /expenses        DELETE /expenses/{id}
                                |                       |                       |
                                v                       v                       v
                        +---------------+       +---------------+       +---------------+
                        |  AWS Lambda   |       |  AWS Lambda   |       |  AWS Lambda   |
                        | (addExpense)  |       | (getExpenses) |       | (deleteExpense|
                        +-------+-------+       +-------+-------+       +-------+-------+
                                |                       |                       |
                                +-----------------------+-----------------------+
                                                        |
                                                        | AWS SDK (DynamoDB Client)
                                                        v
                                        +-------------------------------+
                                        |        Amazon DynamoDB        |
                                        |        Table: Expenses        |
                                        | (PK: userId, SK: expenseId)   |
                                        +-------------------------------+
```

---

## 4. Amazon DynamoDB Table Structure

### Table Definition
- **Table Name:** `Expenses`
- **Partition Key (PK):** `userId` (Type: `String`)
- **Sort Key (SK):** `expenseId` (Type: `String`)
- **Table Class:** Standard
- **Capacity Mode:** **On-Demand** (Pay per request — cost-effective and fits AWS Free Tier)

### Item Schema
| Attribute Name | Data Type | Key Type | Description |
| :--- | :--- | :--- | :--- |
| `userId` | String | **Partition Key (PK)** | Cognito User UUID (`sub`) identifying owner |
| `expenseId` | String | **Sort Key (SK)** | Unique ID (e.g., `exp_1732212345678_ab12cd`) |
| `title` | String | Standard | Description of the expense |
| `amount` | Number | Standard | Expense amount in ₹ (e.g., `450.00`) |
| `category` | String | Standard | `Food`, `Travel`, `Shopping`, `Education`, or `Other` |
| `date` | String | Standard | Expense date in `YYYY-MM-DD` format |
| `createdAt` | String | Standard | ISO 8601 creation timestamp |

> **Why this schema?**  
> Using `userId` as the Partition Key allows a fast, efficient `QueryCommand` to retrieve all expenses belonging to a specific user without performing an expensive, insecure `Scan`.

---

## 5. Amazon API Gateway Endpoints

Create a **REST API** named `ExpenseTrackerAPI`:

| Method | Resource Path | Lambda Integration | Auth Type | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/expenses` | `addExpense` | Cognito Authorizer | Adds a new expense record |
| `GET` | `/expenses` | `getExpenses` | Cognito Authorizer | Lists all expenses for user |
| `DELETE` | `/expenses/{id}` | `deleteExpense` | Cognito Authorizer | Deletes an expense by ID |
| `OPTIONS`| `/expenses`, `/expenses/{id}` | Mock | None | Handles browser CORS preflight |

### CORS Configuration
Ensure CORS is enabled on `/expenses` and `/expenses/{id}`:
- **Access-Control-Allow-Origin:** `'*'`
- **Access-Control-Allow-Headers:** `'Content-Type,Authorization,X-User-Id'`
- **Access-Control-Allow-Methods:** `'OPTIONS,GET,POST,DELETE'`

---

## 6. AWS Lambda Functions

All three Lambda functions use **Node.js 18.x or Node.js 20.x** (which have the AWS SDK v3 `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` built-in, requiring **zero** external npm installations).

### 1. `addExpense`
- **Trigger:** `POST /expenses`
- **Input:** JSON payload `{ title, amount, category, date }`
- **Logic:** 
  1. Validates inputs (title is non-empty, amount > 0, category is in allowed list, date is valid).
  2. Extracts `userId` from Cognito token claims (`event.requestContext.authorizer.claims.sub`).
  3. Generates a unique `expenseId`.
  4. Calls `PutCommand` to insert the item into DynamoDB.
- **Output:** `201 Created` with the inserted item.

### 2. `getExpenses`
- **Trigger:** `GET /expenses`
- **Logic:**
  1. Extracts `userId` from Cognito token claims.
  2. Calls `QueryCommand` where `userId = :uid`.
  3. Returns items sorted for display.
- **Output:** `200 OK` with `{ count, expenses }`.

### 3. `deleteExpense`
- **Trigger:** `DELETE /expenses/{id}`
- **Logic:**
  1. Extracts `userId` from Cognito token claims.
  2. Extracts `expenseId` from URL path parameter `{id}`.
  3. Calls `DeleteCommand` with composite key `{ userId, expenseId }`.
- **Output:** `200 OK` with `{ message, expenseId }`.

---

## 7. Amazon Cognito Setup

Cognito handles user registration, email verification, and secure JWT authentication.

### Steps in AWS Management Console:
1. Navigate to **Amazon Cognito** &rarr; **User Pools** &rarr; **Create user pool**.
2. **Step 1 - Authentication providers:**
   - Select **Email** as the sign-in option.
3. **Step 2 - Password policy:**
   - Leave default (minimum 8 characters, numbers, uppercase).
4. **Step 3 - Multi-factor authentication (MFA):**
   - Select **No MFA** (for simplicity in academic projects).
5. **Step 4 - User sign-up:**
   - Keep self-registration enabled.
   - Attribute verification: Select **Send email message, verify email address**.
6. **Step 5 - Message delivery:**
   - Select **Send email with Cognito** (Free Tier).
7. **Step 6 - Integrate your app:**
   - User pool name: `ExpenseTrackerUserPool`.
   - Initial app client name: `ExpenseTrackerWebClient`.
   - Client secret: Select **Don't generate a client secret** (required for client-side JavaScript apps).
   - Under **Advanced app client settings**, ensure **ALLOW_USER_PASSWORD_AUTH** is checked.
8. Review and click **Create user pool**.
9. Note down:
   - **User Pool ID** (e.g., `ap-south-1_xxxxxxxxx`)
   - **App Client ID** (e.g., `1a2b3c4d5e6f7g8h9i0j`)

---

## 8. AWS IAM Permissions & Policy

Create an IAM Role for your Lambda functions:

1. Navigate to **IAM** &rarr; **Roles** &rarr; **Create role**.
2. Select **AWS service** &rarr; Use case: **Lambda**.
3. Attach standard policy: `AWSLambdaBasicExecutionRole` (allows writing logs to Amazon CloudWatch).
4. Click **Next**, name the role: `ExpenseTrackerLambdaRole`.
5. After creating the role, open it, click **Add permissions** &rarr; **Create inline policy**, choose the **JSON** tab, and paste the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBExpenseAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/Expenses"
    }
  ]
}
```

6. Name this policy `ExpenseTrackerDynamoDBPolicy` and click **Create policy**.

---

## 9. Step-by-Step AWS Deployment Guide

### Step 1: Create the DynamoDB Table
1. Go to **Amazon DynamoDB Console** &rarr; **Tables** &rarr; **Create table**.
2. Table name: `Expenses`
3. Partition key: `userId` (String)
4. Sort key: `expenseId` (String)
5. Under **Table settings**, select **Customize settings**, then choose **On-demand** capacity.
6. Click **Create table**.

### Step 2: Create the 3 Lambda Functions
For each of `addExpense`, `getExpenses`, and `deleteExpense`:
1. Go to **AWS Lambda Console** &rarr; **Create function**.
2. Choose **Author from scratch**.
3. Function name: `addExpense` (repeat for `getExpenses` and `deleteExpense`).
4. Runtime: **Node.js 20.x** (or 18.x).
5. Architecture: `x86_64`.
6. Under **Permissions**, select **Use an existing role**, and pick `ExpenseTrackerLambdaRole`.
7. Click **Create function**.
8. In the **Code Source** editor, paste the contents of the respective `index.js` file from `backend/<functionName>/index.js`.
9. Click **Deploy**.

### Step 3: Create Amazon Cognito User Pool
Follow the instructions in [Section 7](#7-amazon-cognito-setup) to create your User Pool and Client ID.

### Step 4: Create and Configure API Gateway
1. Go to **Amazon API Gateway Console** &rarr; **Create API** &rarr; **REST API** &rarr; **Build**.
2. API Name: `ExpenseTrackerAPI` &rarr; Endpoint Type: `Regional` &rarr; Click **Create API**.
3. **Create Cognito Authorizer:**
   - In left menu, click **Authorizers** &rarr; **Create authorizer**.
   - Name: `CognitoAuth`.
   - Type: **Cognito**.
   - Cognito User Pool: Select `ExpenseTrackerUserPool`.
   - Token Source: `Authorization`.
   - Click **Create authorizer**.
4. **Create Resources & Methods:**
   - Click **Resources** &rarr; Click `/` &rarr; **Create Resource** &rarr; Resource Name: `expenses`.
   - Select `/expenses` &rarr; Click **Create Method**:
     - Method: `POST` &rarr; Integration: Lambda function `addExpense`.
     - After creation, click **Method Request** &rarr; Edit **Authorization** &rarr; Select `CognitoAuth`.
   - Select `/expenses` &rarr; Click **Create Method**:
     - Method: `GET` &rarr; Integration: Lambda function `getExpenses`.
     - Click **Method Request** &rarr; Edit **Authorization** &rarr; Select `CognitoAuth`.
   - Select `/expenses` &rarr; Click **Create Resource**:
     - Resource Path: `{id}` &rarr; Resource Name: `{id}`.
   - Select `/expenses/{id}` &rarr; Click **Create Method**:
     - Method: `DELETE` &rarr; Integration: Lambda function `deleteExpense`.
     - Click **Method Request** &rarr; Edit **Authorization** &rarr; Select `CognitoAuth`.
5. **Enable CORS:**
   - Click `/expenses` &rarr; Click **Enable CORS**.
   - Keep default settings and click **Save**.
   - Click `/expenses/{id}` &rarr; Click **Enable CORS**.
   - Keep default settings and click **Save**.
6. **Deploy the API:**
   - Click **Deploy API** button.
   - Stage: `*New Stage*` &rarr; Stage name: `prod`.
   - Click **Deploy**.
   - Note down the **Invoke URL** (e.g. `https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod`).

---

## 10. Connecting Frontend to AWS

Open `frontend/script.js` and locate the `AWS_CONFIG` object at the top of the file:

```javascript
const AWS_CONFIG = {
  // 1. Paste your API Gateway Invoke URL here:
  apiBaseUrl: "https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod",

  // 2. Paste your Cognito details here:
  cognito: {
    region: "ap-south-1",            // Your AWS Region (e.g. ap-south-1, us-east-1)
    userPoolId: "ap-south-1_xxxxxxxxx", // Your User Pool ID
    clientId: "1a2b3c4d5e6f7g8h9i0j"    // Your App Client ID
  }
};
```

Save the file.

---

## 11. Hosting Frontend on Amazon S3

1. Go to **Amazon S3 Console** &rarr; **Create bucket**.
2. Bucket name: `expense-tracker-frontend-<your-name-or-id>` (must be globally unique).
3. Region: Same region as your API (e.g., `ap-south-1`).
4. **Uncheck** "Block all public access" and acknowledge the warning.
5. Click **Create bucket**.
6. Open your bucket &rarr; Click the **Properties** tab:
   - Scroll down to **Static website hosting** &rarr; Click **Edit**.
   - Select **Enable**.
   - Index document: `index.html`.
   - Click **Save changes**.
7. Click the **Permissions** tab &rarr; **Bucket policy** &rarr; Click **Edit** and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```
*(Replace `YOUR_BUCKET_NAME` with your actual S3 bucket name).*

8. Click the **Objects** tab &rarr; **Upload**:
   - Upload `index.html`, `style.css`, and `script.js`.
9. In **Properties** &rarr; **Static website hosting**, click the **Bucket website endpoint URL**.
10. Your Serverless Expense Tracker is now live on the internet!

---

## 12. Testing & Local Demo Mode

The application includes an **instant Local Demo Mode**:
- If you open `frontend/index.html` directly in any web browser before configuring AWS credentials, the application detects that AWS is not yet configured.
- It displays a **"Local Demo Mode"** status badge and uses browser `localStorage`.
- You can add expenses, delete them, and see the dashboard statistics update in real-time.
- This allows you to test and demonstrate the UI and logic offline or during project grading without needing an active internet connection.

---

## 13. College Viva & Academic Q&A

Here are common questions asked during college semester project evaluations:

### Q1: What makes this architecture "Serverless"?
**Answer:** There are no virtual machines (EC2) or operating systems to manage, patch, or provision. AWS handles high availability, scaling, and fault tolerance automatically. You only pay for the exact compute time consumed by Lambda and requests made to DynamoDB/API Gateway.

### Q2: Why did you choose DynamoDB over MySQL / Relational Database?
**Answer:** 
1. **Seamless Serverless Integration:** DynamoDB requires no connection pooling, whereas relational databases can struggle with thousands of rapid Lambda connections.
2. **Speed & Scalability:** Offers consistent single-digit millisecond latency at any scale.
3. **Cost-effectiveness:** On-demand capacity billing ensures ₹0 cost when no requests are being processed.

### Q3: How do you prevent User A from seeing or deleting User B's expenses?
**Answer:**
1. Authentication is enforced by Amazon Cognito. API Gateway verifies the JWT token and passes the verified user ID (`sub`) to Lambda.
2. In DynamoDB, `userId` is the **Partition Key**.
3. When querying (`getExpenses`), the Lambda explicitly queries `KeyConditionExpression: "userId = :uid"`.
4. When deleting (`deleteExpense`), the Lambda deletes with key `{ userId, expenseId }`. It is cryptographically impossible for User A to query or delete User B's records.

### Q4: Why is there no AWS Secret Key stored in the frontend JavaScript?
**Answer:** Storing AWS Access Key / Secret Key in frontend code is a major security vulnerability. Instead, the frontend uses **Amazon Cognito User Pools** to obtain temporary, signed JSON Web Tokens (JWTs). The API Gateway Authorizer validates this token before triggering Lambda.

---

### Project Completed Successfully!
Designed with simplicity, security, and elegance for your academic submission.
