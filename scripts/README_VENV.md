# Create Python virtual environment

Use these helpers to create a Python venv in this repository.

PowerShell (recommended on Windows):
- From repo root:
  - To create .venv only:
    powershell -ExecutionPolicy Bypass -File .\scripts\create_venv.ps1
  - To create and install requirements:
    powershell -ExecutionPolicy Bypass -File .\scripts\create_venv.ps1 -InstallRequirements

CMD:
- From repo root:
  - Create .venv:
    .\scripts\create_venv.bat
  - Specify name:
    .\scripts\create_venv.bat myenv

Manual commands:
- Create virtualenv:
  python -m venv .venv
- Activate (PowerShell):
  .\.venv\Scripts\Activate.ps1
- Activate (CMD):
  .\.venv\Scripts\activate.bat
- Install requirements:
  pip install -r requirements.txt

Notes:
- Ensure Python 3.8+ is installed and `python` is on PATH.
- The scripts look for `requirements.txt` in the repo root to install dependencies.
