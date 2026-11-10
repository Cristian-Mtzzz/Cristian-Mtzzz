# Regenera los bloques dinámicos del README y los publica en GitHub.
# Pensado para ejecutarse solo, desde el Programador de tareas de Windows.
# Ejecución manual:  powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1

$ErrorActionPreference = "Stop"

# Carpeta del repo = carpeta padre de este script
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$log = Join-Path $repo "scripts\ultima-ejecucion.log"
function Registrar($msg) {
    $linea = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Write-Output $linea
    Add-Content -Path $log -Value $linea -Encoding utf8
}

try {
    Registrar "--- inicio ---"

    # Traer cambios hechos desde la web de GitHub. --autostash conserva lo que
    # tengas editado sin guardar; si hubiera conflicto el script falla y lo
    # registra en el log, pero nunca borra tu trabajo.
    git pull --rebase --autostash --quiet origin main
    Registrar "repo sincronizado con origin/main"

    node scripts/update-readme.mjs | ForEach-Object { Registrar $_ }

    git add README.md
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Registrar "sin cambios, no hay nada que publicar"
    } else {
        git commit -q -m "Actualizar estadisticas del README"
        git push --quiet origin main
        Registrar "cambios publicados en GitHub"
    }

    Registrar "--- fin ---"
}
catch {
    Registrar ("ERROR: " + $_.Exception.Message)
    exit 1
}
