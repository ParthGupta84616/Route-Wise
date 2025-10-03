param(
	[string]$venvName = ".venv",
	[switch]$InstallRequirements
)

# Ensure python is available
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
	Write-Error "Python not found. Install Python 3.8+ and ensure 'python' is in PATH."
	exit 1
}

Write-Output "Creating virtual environment: $venvName"
python -m venv $venvName

if ($LASTEXITCODE -ne 0) {
	Write-Error "Failed to create virtual environment."
	exit 1
}

Write-Output "Virtual environment created at .\$venvName"

if ($InstallRequirements) {
	$pip = Join-Path $venvName "Scripts\pip.exe"
	if (-not (Test-Path $pip)) {
		Write-Error "pip not found in virtual environment."
		exit 1
	}
	Write-Output "Upgrading pip..."
	& $pip install --upgrade pip

	if (Test-Path "requirements.txt") {
		Write-Output "Installing from requirements.txt..."
		& $pip install -r requirements.txt
	} else {
		Write-Output "No requirements.txt found in repo root."
	}
}

Write-Output "`nActivation:"
Write-Output " PowerShell: `t.\$venvName\Scripts\Activate.ps1"
Write-Output " CMD:       `t.\$venvName\Scripts\activate.bat"
Write-Output " To exit:   `tdeactivate"