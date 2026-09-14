# Read-only probe: figure out why the console shows 403 on the matter tables and
# 400 on the inquiry insert. Nothing here writes.
$ErrorActionPreference = 'Continue'

$url = (Get-Content .env | Select-String 'VITE_SUPABASE_URL=(.+)').Matches.Groups[1].Value.Trim()
$key = (Get-Content .env | Select-String 'VITE_SUPABASE_ANON_KEY=(.+)').Matches.Groups[1].Value.Trim()
$h = @{ apikey = $key; Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }

function Probe($label, $method, $path, $body) {
  $uri = "$url$path"
  try {
    if ($body) {
      $r = Invoke-WebRequest -Uri $uri -Method $method -Headers $h -Body $body -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Uri $uri -Method $method -Headers $h -UseBasicParsing
    }
    $t = [string]$r.Content
    if ($t.Length -gt 150) { $t = $t.Substring(0, 150) + '...' }
    Write-Output ("{0,-46} {1}  {2}" -f $label, $r.StatusCode, $t)
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $msg = ''
    try {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $msg = $sr.ReadToEnd()
    } catch { }
    if ($msg.Length -gt 150) { $msg = $msg.Substring(0, 150) + '...' }
    Write-Output ("{0,-46} {1}  {2}" -f $label, $code, $msg)
  }
}

Write-Output '--- was 20261005 applied? (401 = yes, 200 = no) ---'
Probe 'lawyers_legacy'                'GET' '/rest/v1/lawyers_legacy?select=id&limit=1'

Write-Output ''
Write-Output '--- is inquiries.preferred_contact_method present? ---'
Probe 'inquiries.preferred_contact_method' 'GET' '/rest/v1/inquiries?select=preferred_contact_method&limit=1'
Probe 'inquiries.subject (known column)'   'GET' '/rest/v1/inquiries?select=subject&limit=1'

Write-Output ''
Write-Output '--- the four tables 20261001 created ---'
Probe 'matter_members'                'GET' '/rest/v1/matter_members?select=matter_id&limit=1'
Probe 'matter_notes'                  'GET' '/rest/v1/matter_notes?select=id&limit=1'
Probe 'matter_events'                 'GET' '/rest/v1/matter_events?select=id&limit=1'
Probe 'confidential_access_grants'    'GET' '/rest/v1/confidential_access_grants?select=id&limit=1'

Write-Output ''
Write-Output '--- control: tables from older migrations ---'
Probe 'matters'                       'GET' '/rest/v1/matters?select=id&limit=1'
Probe 'documents'                     'GET' '/rest/v1/documents?select=id&limit=1'
Probe 'notifications'                 'GET' '/rest/v1/notifications?select=id&limit=1'
Probe 'appointments'                  'GET' '/rest/v1/appointments?select=id&limit=1'
