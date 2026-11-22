$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stage = [IO.Path]::GetFullPath($env:BB_STAGE)
$archive = [IO.Compression.ZipFile]::OpenRead($env:BB_ZIP)
try {
 foreach ($entry in $archive.Entries) {
  $name = $entry.FullName.Replace('\','/')
  if ($env:BB_RUNTIME -eq 'postgres') { $include = $name -match '^pgsql/(bin|lib|share|doc)/' }
  else { $include = $name -match '^node-[^/]+/(node.exe|LICENSE)$' }
  if (!$include -or $name.EndsWith('/')) { continue }
  $target = [IO.Path]::GetFullPath([IO.Path]::Combine($stage,$name))
  if (!$target.StartsWith($stage + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escaped extraction folder' }
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
 }
} finally { $archive.Dispose() }
