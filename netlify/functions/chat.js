const chatHandler = require("../../api/chat");

exports.handler = async (event) => {
  let statusCode = 200;
  const headers = {};
  let responseBody = "";

  const req = {
    method: event.httpMethod,
    body: event.body || "",
    headers: event.headers || {},
  };

  const res = {
    setHeader(name, value) {
      headers[name] = value;
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      headers["Content-Type"] = "application/json";
      responseBody = JSON.stringify(payload);
      return res;
    },
    end(payload = "") {
      responseBody = payload;
      return res;
    },
  };

  await chatHandler(req, res);

  return {
    statusCode,
    headers,
    body: responseBody,
  };
};
