@echo off
rem 펫을 dist\pet.exe 하나로 묶는다. week-03 폴더에서 더블클릭하거나 build.bat 으로 실행.
rem --windowed: 검은 명령창을 띄우지 않음 / --add-data: 포즈 그림 4장을 exe 안에 넣음
cd /d "%~dp0"
.venv\Scripts\pyinstaller.exe --noconfirm --clean --onefile --windowed --name pet ^
  --add-data "art\rest.png;art" ^
  --add-data "art\type1.png;art" ^
  --add-data "art\type2.png;art" ^
  --add-data "art\sleep.png;art" ^
  pet.py
