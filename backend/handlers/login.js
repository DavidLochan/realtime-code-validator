// handlers/login.js
const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient();
const USERS_TABLE = process.env.USERS_TABLE;

exports.handler = async (event) => {
  console.log('LOGIN event:', event);

  try {
    const body = JSON.parse(event.body || '{}');
    const { email, password } = body;

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Email and password required' })
      };
    }

    const result = await ddb.get({
      TableName: USERS_TABLE,
      Key: { email }
    }).promise();

    if (!result.Item || result.Item.password !== password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid credentials' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Login successful', email })
    };
  } catch (err) {
    console.error('login error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal error' })
    };
  }
};
