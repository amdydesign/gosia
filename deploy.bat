@echo off
REM Deploy: builduje frontend, synchronizuje artefakty do rootu repo,
REM commituje i wypycha na GitHub. Na serwerze potem: git pull origin main

echo [1/3] Build frontendu...
cd frontend
call npm run deploy
if errorlevel 1 (
    echo Build nie powiodl sie - przerywam.
    cd ..
    pause
    exit /b 1
)
cd ..

echo [2/3] Commit...
git add .
set /p commit_msg="Podaj opis zmian (ENTER = 'Aktualizacja'): "
if "%commit_msg%"=="" set commit_msg=Aktualizacja
git commit -m "%commit_msg%"

echo [3/3] Push...
git push

echo.
echo Gotowe! Na serwerze uruchom: git pull origin main
pause
