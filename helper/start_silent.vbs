Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
batPath = scriptDir & "\start_silent.bat"
WshShell.Run "cmd.exe /c """ & batPath & """", 0, False
