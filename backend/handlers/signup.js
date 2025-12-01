// handlers/signup.js
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

exports.handler = async (event) => {
  console.log('SIGNUP event:', event);

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Email and password required' })
      };
    }

    // check if user already exists
    const existing = await ddb.get({
      TableName: USERS_TABLE,
      Key: { email }
    }).promise();

    if (existing.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'User already exists' })
      };
    }

    // DEMO ONLY: store plain password (don’t do this in real life)
    await ddb.put({
      TableName: USERS_TABLE,
      Item: { email, password }
    }).promise();

    return {
      statusCode: 201,
      body: JSON.stringify({ message: 'Account created', email })
    };
  } catch (err) {
    console.error('signup error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal error' })
    };
  }
};
