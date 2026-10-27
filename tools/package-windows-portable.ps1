param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$ArchivePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ZipFile streams files, supports ZIP64, and encodes entry names as UTF-8.
# Compress-Archive has a 2 GiB input-file limitation and must not be used here.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[AppContext]::SetSwitch('Switch.System.IO.Compression.ZipFile.UseBackslash', $false)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $SourceDirectory,
    $ArchivePath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false,
    [System.Text.Encoding]::UTF8
)
