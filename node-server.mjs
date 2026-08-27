import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { createServer } from "node:http";

import app from "./dist/server/server.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const clientDir = resolve("dist/client");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[\\/])+/, "").replace(/^[/\\]+/, "");
  const filePath = join(clientDir, normalizedPath);

  if (!filePath.startsWith(clientDir)) {
    return null;
  }

  return existsSync(filePath) ? filePath : null;
}

function sendStaticFile(req, res, filePath) {
  res.statusCode = 200;
  res.setHeader("content-type", mimeTypes[extname(filePath)] || "application/octet-stream");
  res.setHeader("cache-control", "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

async function sendFetchResponse(res, response) {
  res.statusCode = response.status;

  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    if (cookies && cookies.length > 0) {
      res.setHeader("set-cookie", cookies);
    }
  } else {
    const cookie = response.headers.get("set-cookie");
    if (cookie) {
      res.setHeader("set-cookie", cookie);
    }
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      res.setHeader(key, value);
    }
  });

  if (!response.body) {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
}

createServer(async (req, res) => {
  try {
    const hostHeader = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${port}`;
    const protoHeader = req.headers["x-forwarded-proto"] || "http";
    const url = new URL(req.url || "/", `${protoHeader}://${hostHeader}`);

    // Favicon fallback to avoid 404 noise
    if (url.pathname === "/favicon.ico") {
      const staticFavicon = getStaticPath("/favicon.ico") || getStaticPath("/assets/ICON DADO-Db6N-zBf.png");
      if (staticFavicon) {
        sendStaticFile(req, res, staticFavicon);
        return;
      }
      res.statusCode = 204;
      res.end();
      return;
    }

    // Serve static files from dist/client
    if (url.pathname.startsWith("/assets/") || url.pathname.includes(".")) {
      const staticPath = getStaticPath(url.pathname);
      if (staticPath) {
        sendStaticFile(req, res, staticPath);
        return;
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: "half",
    });

    const response = await app.fetch(request, process.env, {});
    await sendFetchResponse(res, response);
  } catch (error) {
    console.error("Server Error:", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
