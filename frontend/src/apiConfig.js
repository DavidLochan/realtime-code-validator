// export const WS_URL = "wss://k2p23yxaw1.execute-api.us-east-1.amazonaws.com/dev";

// // ⬇️ replace with the value you saw in `serverless info -v`
// export const API_BASE = "https://wwig961uac.execute-api.us-east-1.amazonaws.com";


// frontend/src/apiConfig.js

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  "wss://k2p23yxaw1.execute-api.us-east-1.amazonaws.com/dev"; // your WebSocket URL

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://wwig961uac.execute-api.us-east-1.amazonaws.com";   // 🔁 put YOUR real HTTP API base here

export { WS_URL, API_BASE };

