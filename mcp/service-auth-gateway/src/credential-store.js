import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SECRET_PREFIX } from "./constants.js";

const execFileAsync = promisify(execFile);

function targetName(provider) {
  return `${SECRET_PREFIX}/${provider}/default`;
}

function isWindows() {
  return process.platform === "win32";
}

function isTestMode() {
  return process.env.CODEX_AUTH_GATEWAY_TEST_MODE === "1";
}

function escapePs(value) {
  return String(value).replace(/'/g, "''");
}

async function runPowerShell(script) {
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true },
  );
  return stdout.trim();
}

export async function setSecret(provider, payload) {
  if (isTestMode()) {
    process.env[`CODEX_AUTH_GATEWAY_SECRET_${provider.toUpperCase()}`] = JSON.stringify(payload);
    return;
  }
  if (!isWindows()) {
    throw new Error("Windows Credential Manager is required on this host.");
  }
  const target = escapePs(targetName(provider));
  const secret = escapePs(JSON.stringify(payload));
  const script = `
Add-Type -AssemblyName System.Runtime.InteropServices
$target = '${target}'
$secret = '${secret}'
$content = [Text.Encoding]::Unicode.GetBytes($secret)
$size = $content.Length
$cred = New-Object PSObject -Property @{
  Flags = 0
  Type = 1
  TargetName = $target
  Comment = 'Codex auth gateway secret'
  LastWritten = 0
  CredentialBlobSize = $size
  CredentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($secret)
  Persist = 2
  AttributeCount = 0
  Attributes = [IntPtr]::Zero
  TargetAlias = $null
  UserName = 'codex-auth-gateway'
}
$signature = @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct NativeCredential {
  public int Flags;
  public int Type;
  public string TargetName;
  public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public int CredentialBlobSize;
  public IntPtr CredentialBlob;
  public int Persist;
  public int AttributeCount;
  public IntPtr Attributes;
  public string TargetAlias;
  public string UserName;
}
public static class CredMan {
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredWrite([In] ref NativeCredential userCredential, [In] uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredDelete(string target, uint type, uint flags);
}
'@
Add-Type $signature
$native = New-Object NativeCredential
$native.Flags = 0
$native.Type = 1
$native.TargetName = $target
$native.Comment = 'Codex auth gateway secret'
$native.CredentialBlobSize = $size
$native.CredentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($secret)
$native.Persist = 2
$native.AttributeCount = 0
$native.Attributes = [IntPtr]::Zero
$native.TargetAlias = $null
$native.UserName = 'codex-auth-gateway'
if (-not [CredMan]::CredWrite([ref]$native, 0)) {
  throw 'CredWrite failed'
}
`;
  await runPowerShell(script);
}

export async function getSecret(provider) {
  if (isTestMode()) {
    const raw = process.env[`CODEX_AUTH_GATEWAY_SECRET_${provider.toUpperCase()}`];
    return raw ? JSON.parse(raw) : null;
  }
  if (!isWindows()) {
    throw new Error("Windows Credential Manager is required on this host.");
  }
  const target = escapePs(targetName(provider));
  const script = `
$signature = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct NativeCredential {
  public int Flags;
  public int Type;
  public string TargetName;
  public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public int CredentialBlobSize;
  public IntPtr CredentialBlob;
  public int Persist;
  public int AttributeCount;
  public IntPtr Attributes;
  public string TargetAlias;
  public string UserName;
}
public static class CredMan {
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", EntryPoint="CredFree", SetLastError=true)]
  public static extern void CredFree([In] IntPtr cred);
}
'@
Add-Type $signature
$ptr = [IntPtr]::Zero
if (-not [CredMan]::CredRead('${target}', 1, 0, [ref]$ptr)) { return }
try {
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][NativeCredential])
  if ($cred.CredentialBlob -eq [IntPtr]::Zero -or $cred.CredentialBlobSize -le 0) { return }
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, [int]($cred.CredentialBlobSize / 2))
  Write-Output $secret
}
finally {
  [CredMan]::CredFree($ptr)
}
`;
  const raw = await runPowerShell(script);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}

export async function deleteSecret(provider) {
  if (isTestMode()) {
    delete process.env[`CODEX_AUTH_GATEWAY_SECRET_${provider.toUpperCase()}`];
    return;
  }
  if (!isWindows()) {
    throw new Error("Windows Credential Manager is required on this host.");
  }
  const target = escapePs(targetName(provider));
  const script = `
$signature = @'
using System;
using System.Runtime.InteropServices;
public static class CredMan {
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredDelete(string target, uint type, uint flags);
}
'@
Add-Type $signature
[void][CredMan]::CredDelete('${target}', 1, 0)
`;
  await runPowerShell(script);
}
