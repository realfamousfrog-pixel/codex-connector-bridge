import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseResponsePayload(bodyText) {
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return bodyText;
  }
}

function shouldUseWindowsFallback(error) {
  return (
    process.platform === "win32" &&
    (error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" || /fetch failed/i.test(error?.message ?? ""))
  );
}

function encodeForPowerShell(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

async function powershellJsonRequest(url, options = {}) {
  const method = options.method ?? "GET";
  const headers = options.headers ?? {};
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body") && options.body != null;
  const body = hasBody ? options.body : "";
  const url64 = encodeForPowerShell(url);
  const method64 = encodeForPowerShell(method);
  const headers64 = encodeForPowerShell(JSON.stringify(headers));
  const body64 = encodeForPowerShell(body);
  const hasBodyLiteral = hasBody ? "$true" : "$false";
  const script = `
$url = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${url64}'))
$method = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${method64}'))
$headersJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${headers64}'))
$body = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${body64}'))
$hasBody = ${hasBodyLiteral}
$headers = @{}
if ($headersJson) {
  $parsed = ConvertFrom-Json $headersJson
  if ($parsed) {
    $parsed.PSObject.Properties | ForEach-Object { $headers[$_.Name] = [string]$_.Value }
  }
}
try {
  $invokeArgs = @{
    UseBasicParsing = $true
    Method = $method
    Uri = $url
    Headers = $headers
    TimeoutSec = 30
  }
  if ($hasBody) {
    $invokeArgs.Body = $body
  }
  $response = Invoke-WebRequest @invokeArgs
  $status = [int]$response.StatusCode
  $respHeaders = @{}
  if ($response.Headers -and $response.Headers.GetEnumerator()) {
    $response.Headers.GetEnumerator() | ForEach-Object { $respHeaders[$_.Key] = [string]$_.Value }
  }
  [PSCustomObject]@{
    ok = $true
    status = $status
    headers = $respHeaders
    bodyText = [string]$response.Content
  } | ConvertTo-Json -Depth 6 -Compress
}
catch {
  $resp = $_.Exception.Response
  if ($resp) {
    $status = [int]$resp.StatusCode
    $respHeaders = @{}
    if ($resp.Headers -and $resp.Headers.GetEnumerator()) {
      $resp.Headers.GetEnumerator() | ForEach-Object {
        if ($null -ne $_ -and $null -ne $_.Key) {
          $respHeaders[$_.Key] = [string]$_.Value
        }
      }
    }
    $content = ''
    $stream = $resp.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $content = $reader.ReadToEnd()
    }
    [PSCustomObject]@{
      ok = $false
      status = $status
      headers = $respHeaders
      bodyText = [string]$content
    } | ConvertTo-Json -Depth 6 -Compress
  } else {
    throw
  }
}
`;
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 10 },
  );
  const parsed = JSON.parse(stdout.trim());
  return {
    ok: parsed.ok,
    status: parsed.status,
    headers: parsed.headers ?? {},
    body: parseResponsePayload(parsed.bodyText ?? ""),
  };
}

export async function jsonRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const bodyText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: parseResponsePayload(bodyText),
    };
  } catch (error) {
    if (!shouldUseWindowsFallback(error)) {
      throw error;
    }
    return powershellJsonRequest(url, options);
  }
}
