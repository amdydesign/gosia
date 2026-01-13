@echo off
echo Trwa wysyłanie zmian na GitHub...
git add .
set /p commit_msg="Podaj opis zmian (lub wcisnij ENTER dla 'Aktualizacja'): "
if "%commit_msg%"=="" set commit_msg=Aktualizacja
git commit -m "%commit_msg%"
git push
echo.
echo Gotowe!
pause
