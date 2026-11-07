Option Explicit

' 静默运行 auto-commit.cmd：0 = 隐藏窗口，True = 等待并返回退出码
Dim fso, shell, root, cmd, code
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
cmd = """" & root & "\tools\auto-commit.cmd"""

On Error Resume Next
code = shell.Run(cmd, 0, True)
If Err.Number <> 0 Then
  WScript.Quit 1
End If
On Error GoTo 0
WScript.Quit code
