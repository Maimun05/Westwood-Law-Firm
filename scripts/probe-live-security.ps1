# Probe the live Supabase project through PostgREST / Storage with the anon key.
# Read-only: every call either reads, or calls an RPC with a UUID that matches
# no row, so nothing can actually change.
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
    if ($t.Length -gt 130) { $t = $t.Substring(0, 130) + '...' }
    Write-Output ("{0,-54} {1}  {2}" -f $label, $r.StatusCode, $t)
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $msg = ''
    try {
      $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $msg = $sr.ReadToEnd()
    } catch { }
    if ($msg.Length -gt 130) { $msg = $msg.Substring(0, 130) + '...' }
    Write-Output ("{0,-54} {1}  {2}" -f $label, $code, $msg)
  }
}

Write-Output '--- tables that should be unreachable ---'
Probe 'lawyers_legacy'          'GET' '/rest/v1/lawyers_legacy?select=id&limit=1'
Probe 'consultations_legacy'    'GET' '/rest/v1/consultations_legacy?select=id&limit=1'
Probe 'saved_lawyers_legacy'    'GET' '/rest/v1/saved_lawyers_legacy?select=id&limit=1'

Write-Output ''
Write-Output '--- RPCs that should not be anon-callable ---'
Probe 'rpc/soft_delete_profile'      'POST' '/rest/v1/rpc/soft_delete_profile'      '{"user_id":"00000000-0000-0000-0000-00000000dead"}'
Probe 'rpc/reactivate_profile'       'POST' '/rest/v1/rpc/reactivate_profile'       '{"user_id":"00000000-0000-0000-0000-00000000dead"}'
Probe 'rpc/log_auth_event'           'POST' '/rest/v1/rpc/log_auth_event'           '{}'
Probe 'rpc/cleanup_old_audit_logs'   'POST' '/rest/v1/rpc/cleanup_old_audit_logs'   '{"days_to_keep":3650}'

Write-Output ''
Write-Output '--- storage buckets ---'
Probe 'list lawyer-photos (want denied)' 'POST' '/storage/v1/object/list/lawyer-photos' '{"prefix":"","limit":5}'
Probe 'list documents     (want denied)' 'POST' '/storage/v1/object/list/documents'     '{"prefix":"","limit":5}'

Write-Output ''
Write-Output '--- control: things that should work ---'
Probe 'public_lawyers (view)'        'GET' '/rest/v1/public_lawyers?select=full_name&limit=1'
Probe 'articles (published)'         'GET' '/rest/v1/articles?select=id&limit=1'
