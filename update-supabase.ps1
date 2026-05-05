# Met à jour supabase.js à la dernière version disponible sur npm.
# Usage : .\update-supabase.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "Récupération de la dernière version sur npm..."
$meta = Invoke-RestMethod -Uri 'https://registry.npmjs.org/@supabase/supabase-js/latest'
$version = $meta.version
Write-Host "Dernière version : $version"

$url = "https://unpkg.com/@supabase/supabase-js@$version/dist/umd/supabase.js"
Write-Host "Téléchargement depuis $url ..."
Invoke-WebRequest -Uri $url -OutFile 'supabase.js' -UseBasicParsing

$size = (Get-Item supabase.js).Length
Write-Host "OK : supabase.js ($([Math]::Round($size/1KB,1)) Ko)"

$diff = git diff --stat supabase.js
if (-not $diff) {
  Write-Host "Aucun changement (déjà à jour)."
  exit 0
}

Write-Host ""
Write-Host "Changements détectés. Commit + push ? (O/n)"
$ans = Read-Host
if ($ans -eq '' -or $ans -eq 'O' -or $ans -eq 'o') {
  git add supabase.js
  git commit -m "chore: bump supabase-js to $version"
  git push
  Write-Host "Pushé."
} else {
  Write-Host "Aucun commit. Le fichier est modifié localement."
}
