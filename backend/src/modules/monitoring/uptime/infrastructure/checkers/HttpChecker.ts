import { Logger } from "@nestjs/common";
import * as https from "https";
import * as http from "http";
import * as tls from "tls";
import { URL } from "url";
import {
  Monitor,
  MonitorType,
  HttpMethod,
  HttpConfig,
} from "../../domain/aggregates/Monitor";
import {
  CheckStatus,
  CheckTiming,
  SslInfo,
} from "../../domain/aggregates/UptimeCheck";

export interface CheckResult {
  status: CheckStatus;
  statusCode?: number;
  responseTime: number;
  timing?: CheckTiming;
  message?: string;
  error?: string;
  sslInfo?: SslInfo;
  responseHeaders?: Record<string, string>;
  ipAddress?: string;
}

export class HttpChecker {
  private static readonly logger = new Logger(HttpChecker.name);

  static async check(monitor: Monitor): Promise<CheckResult> {
    const type = monitor.type;

    switch (type) {
      case MonitorType.HTTP:
      case MonitorType.HTTPS:
      case MonitorType.KEYWORD:
      case MonitorType.JSON_QUERY:
        return this.performHttpCheck(monitor);
      case MonitorType.TCP:
        return this.performTcpCheck(monitor);
      case MonitorType.PING:
        return this.performPingCheck(monitor);
      default:
        return this.performHttpCheck(monitor);
    }
  }

  private static async performHttpCheck(
    monitor: Monitor,
  ): Promise<CheckResult> {
    const startTime = process.hrtime.bigint();
    const timeoutMs = (monitor.timeout || 30) * 1000;
    const httpConfig = monitor.httpConfig;
    const method = httpConfig?.method || HttpMethod.GET;

    let url: URL;
    try {
      url = new URL(monitor.url);
    } catch {
      return {
        status: CheckStatus.ERROR,
        responseTime: 0,
        error: `Invalid URL: ${monitor.url}`,
        message: "URL parsing failed",
      };
    }

    const isHttps = url.protocol === "https:";

    return new Promise<CheckResult>((resolve) => {
      const timings: Partial<CheckTiming> = {};
      let dnsStart: bigint;
      let connectStart: bigint;
      let tlsStart: bigint;
      let responseStart: bigint;

      const requestOptions: http.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        timeout: timeoutMs,
        headers: {
          "User-Agent": "TelemetryFlow-Uptime/v1.4.0",
          ...(httpConfig?.headers || {}),
        },
      };

      if (isHttps) {
        (requestOptions as https.RequestOptions).rejectUnauthorized =
          !httpConfig?.ignoreTlsErrors;
        // Disable keep-alive so every check gets a fresh TLS handshake.
        // This ensures getPeerCertificate() always returns complete cert data
        // (TLS session resumption can return an empty/partial certificate).
        (requestOptions as https.RequestOptions).agent = new https.Agent({
          keepAlive: false,
          rejectUnauthorized: !httpConfig?.ignoreTlsErrors,
        });
      }

      const transport = isHttps ? https : http;

      // sslInfo is captured in req.on("socket") → "secureConnect" below,
      // which fires during TLS handshake — before any response data arrives.
      let sslInfo: SslInfo | undefined;

      const req = transport.request(requestOptions, (res) => {
        responseStart = process.hrtime.bigint();
        timings.firstByte = Number(responseStart - startTime) / 1e6;

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));

        res.on("end", () => {
          const endTime = process.hrtime.bigint();
          const totalMs = Number(endTime - startTime) / 1e6;
          timings.contentTransfer = Number(endTime - responseStart) / 1e6;
          timings.total = totalMs;

          const statusCode = res.statusCode || 0;
          const rawAccepted = httpConfig?.acceptedStatusCodes || [
            200, 201, 202, 203, 204, 301, 302, 307, 308,
          ];
          // Support both individual codes (200) and range strings ("200-299")
          const isUp = rawAccepted.some((entry) => {
            if (typeof entry === "number") return entry === statusCode;
            const match = String(entry).match(/^(\d+)-(\d+)$/);
            if (match) {
              return statusCode >= parseInt(match[1], 10) && statusCode <= parseInt(match[2], 10);
            }
            return parseInt(String(entry), 10) === statusCode;
          });

          // Collect response headers
          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") {
              responseHeaders[key] = value;
            } else if (Array.isArray(value)) {
              responseHeaders[key] = value.join(", ");
            }
          }

          resolve({
            status: isUp ? CheckStatus.SUCCESS : CheckStatus.FAILURE,
            statusCode,
            responseTime: Math.round(totalMs),
            timing: timings as CheckTiming,
            message: isUp
              ? `HTTP ${statusCode} OK`
              : `HTTP ${statusCode} - not in accepted status codes`,
            sslInfo,
            responseHeaders,
            ipAddress: res.socket?.remoteAddress,
          });
        });
      });

      // Capture SSL cert info via secureConnect — fires right after the TLS
      // handshake completes, guaranteed to have full peer certificate data.
      if (isHttps) {
        req.on("socket", (socket) => {
          socket.on("secureConnect", () => {
            try {
              const tlsSocket = socket as tls.TLSSocket;
              const cert = tlsSocket.getPeerCertificate();
              if (cert && cert.valid_to) {
                const validTo = new Date(cert.valid_to);
                const daysUntilExpiry = Math.floor(
                  (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                );
                sslInfo = {
                  valid: tlsSocket.authorized,
                  issuer: Array.isArray(cert.issuer?.O) ? cert.issuer.O[0] : cert.issuer?.O,
                  subject: Array.isArray(cert.subject?.CN) ? cert.subject.CN[0] : cert.subject?.CN,
                  validFrom: cert.valid_from
                    ? new Date(cert.valid_from)
                    : undefined,
                  validTo,
                  daysUntilExpiry,
                  protocol: tlsSocket.getProtocol() || undefined,
                };
              }
            } catch {
              // SSL info extraction is best-effort
            }
          });
        });
      }

      req.on("timeout", () => {
        req.destroy();
        const totalMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({
          status: CheckStatus.TIMEOUT,
          responseTime: Math.round(totalMs),
          error: `Request timed out after ${timeoutMs}ms`,
          message: "Connection timed out",
        });
      });

      req.on("error", (err: NodeJS.ErrnoException) => {
        const totalMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({
          status: CheckStatus.ERROR,
          responseTime: Math.round(totalMs),
          error: err.message,
          message: `Connection error: ${err.code || err.message}`,
        });
      });

      // Send body for POST/PUT/PATCH
      if (httpConfig?.body && ["POST", "PUT", "PATCH"].includes(method)) {
        req.write(httpConfig.body);
      }

      req.end();
    });
  }

  private static async performTcpCheck(monitor: Monitor): Promise<CheckResult> {
    const startTime = process.hrtime.bigint();
    const timeoutMs = (monitor.timeout || 30) * 1000;
    const net = await import("net");

    let url: URL;
    try {
      url = new URL(monitor.url);
    } catch {
      return {
        status: CheckStatus.ERROR,
        responseTime: 0,
        error: `Invalid URL: ${monitor.url}`,
      };
    }

    return new Promise<CheckResult>((resolve) => {
      const socket = net.createConnection(
        {
          host: url.hostname,
          port: parseInt(url.port) || 80,
          timeout: timeoutMs,
        },
        () => {
          const totalMs = Number(process.hrtime.bigint() - startTime) / 1e6;
          socket.destroy();
          resolve({
            status: CheckStatus.SUCCESS,
            responseTime: Math.round(totalMs),
            message: "TCP connection successful",
            ipAddress: socket.remoteAddress,
          });
        },
      );

      socket.on("timeout", () => {
        socket.destroy();
        const totalMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({
          status: CheckStatus.TIMEOUT,
          responseTime: Math.round(totalMs),
          error: "TCP connection timed out",
        });
      });

      socket.on("error", (err) => {
        const totalMs = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({
          status: CheckStatus.ERROR,
          responseTime: Math.round(totalMs),
          error: err.message,
        });
      });
    });
  }

  private static async performPingCheck(
    monitor: Monitor,
  ): Promise<CheckResult> {
    // Fallback to HTTP HEAD for ping-style check
    return this.performHttpCheck(monitor);
  }
}
