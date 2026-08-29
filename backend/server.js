import { createServer } from "node:http";
import { createReservation } from "./reservation-service.js";

const port = Number(process.env.PORT ?? 3001);

const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/api/reservations") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
    return;
  }

  let rawBody = "";
  request.on("data", chunk => {
    rawBody += chunk;
  });
  request.on("end", () => {
    try {
      const result = createReservation(JSON.parse(rawBody));
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "INVALID_JSON" }));
    }
  });
});

server.listen(port, () => {
  console.log(`ContractRescue sample API listening on http://localhost:${port}`);
});

