# Registra la tarea que mantiene el README actualizado solo.
#
# Para instalarla: clic derecho sobre este archivo -> "Ejecutar con PowerShell"
# (no necesita permisos de administrador).
#
# Para desinstalarla despues:
#   Unregister-ScheduledTask -TaskName "Actualizar README de GitHub" -Confirm:$false

$ErrorActionPreference = "Stop"

$nombre = "Actualizar README de GitHub"
$script = Join-Path $PSScriptRoot "actualizar.ps1"

if (-not (Test-Path $script)) {
    Write-Host "No encontre actualizar.ps1 junto a este archivo." -ForegroundColor Red
    Read-Host "Enter para salir"
    exit 1
}

if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) {
    Write-Host "La tarea ya existia. La vuelvo a crear con la configuracion actual." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
}

$accion = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument ('-ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "{0}"' -f $script)

# Dos disparadores: todos los dias a las 20:00, y 5 minutos despues de iniciar
# sesion. Asi se pone al dia aunque la PC haya estado apagada.
$disparadores = @(
    (New-ScheduledTaskTrigger -Daily -At "20:00"),
    (New-ScheduledTaskTrigger -AtLogOn)
)
$disparadores[1].Delay = "PT5M"

$ajustes = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $nombre `
    -Action $accion `
    -Trigger $disparadores `
    -Settings $ajustes `
    -Principal $principal `
    -Description "Regenera los lenguajes y la lista de proyectos del README del perfil de GitHub y publica los cambios." | Out-Null

Write-Host ""
Write-Host "Tarea instalada." -ForegroundColor Green
Write-Host "  Corre todos los dias a las 20:00 y 5 min despues de iniciar sesion."
Write-Host "  Si la PC estaba apagada, se ejecuta en cuanto la prendas."
Write-Host ""

$r = Read-Host "Quieres ejecutarla ahora para probar? (s/n)"
if ($r -eq "s") {
    Start-ScheduledTask -TaskName $nombre
    Write-Host "Lanzada. El resultado queda en scripts\ultima-ejecucion.log" -ForegroundColor Green
}

Read-Host "Enter para cerrar"
