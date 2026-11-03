/*
 * File: src/server.ts
 * Purpose: HTTP entry point.
 * AI Contribution Weight: [90%] AI Generated / [10%] Human Refactored
 */
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: "pai-api listening", port }));
});
