# Nova Terminal shell integration for PowerShell (Windows PowerShell 5.1 and
# PowerShell 7+).
#
# Sends invisible escape codes that let Nova:
#   OSC 133 A/B  - know where the prompt is (so it can use its own input box)
#   OSC 133 C    - know a command started (hide the input box, show "running")
#   OSC 133 D;n  - know it finished, with its exit code (draw the block, red if failed)
#   OSC 7        - know the current folder (tab name, folder chip, git branch)
#   OSC 6973     - PATH, aliases, commands and history file, for suggestions
#
# Nova runs this after your profile (PowerShell is started with -NoExit and
# a command that reads this file), so your own settings load as usual.
# Written for PowerShell 5.1 too: no `e, ?:, ?? or && here.

if (-not $global:__NovaLoaded) {
  $global:__NovaLoaded = $true

  $global:__NovaState = @{
    Running      = $false
    ExitAtStart  = $null
    HistoryId    = -1
    SentPath     = $null
    SentAliases  = $null
    SentHistFile = $null
    Commands     = $null
    CommandsSent = $false
    Hooked       = $false
  }

  function global:__NovaOsc([string]$Body) {
    return [string][char]27 + ']' + $Body + [string][char]7
  }

  # Called with each command line you run (from PSReadLine, see below).
  function global:__NovaCommandStarts([string]$Line) {
    if ([string]::IsNullOrWhiteSpace($Line)) { return }
    $state = $global:__NovaState
    $state.Running = $true
    $state.ExitAtStart = $global:LASTEXITCODE
    $text = $Line -replace '[\x00-\x1f\x7f]', ' '
    [Console]::Write((__NovaOsc "133;C;$text"))
  }

  # Hooks into PSReadLine (it loads after this file runs, so this happens on
  # the first prompt).
  function global:__NovaHook {
    $state = $global:__NovaState
    if ($state.Hooked) { return }
    $state.Hooked = $true
    $readLine = Get-Command PSConsoleHostReadLine -CommandType Function -ErrorAction SilentlyContinue
    if (-not $readLine) { return }
    $global:__NovaReadLine = $readLine.ScriptBlock
    function global:PSConsoleHostReadLine {
      $line = & $global:__NovaReadLine
      __NovaCommandStarts $line
      $line
    }
    # Nova's input box sends Ctrl+U before each command to clear whatever is
    # on the shell's own line. Windows editing mode has no key for that.
    try {
      $bound = Get-PSReadLineKeyHandler -Bound | Where-Object { $_.Key -eq 'Ctrl+u' }
      if (-not $bound) { Set-PSReadLineKeyHandler -Chord 'Ctrl+u' -Function RevertLine }
    } catch { }
  }

  # Cmdlet and function names, for suggestions and colouring. Looking them
  # all up takes a moment, so it runs in the background and is sent with a
  # later prompt.
  try {
    $lookup = [PowerShell]::Create()
    [void]$lookup.AddScript('(Get-Command -CommandType Cmdlet, Function -ErrorAction SilentlyContinue | ForEach-Object { $_.Name } | Sort-Object -Unique) -join " "')
    $global:__NovaState.Commands = @{ Shell = $lookup; Result = $lookup.BeginInvoke() }
  } catch { }

  function global:prompt {
    # Read these first: anything that runs after them changes them.
    $ok = $global:?
    $nativeExit = $global:LASTEXITCODE
    $state = $global:__NovaState
    $out = New-Object System.Text.StringBuilder
    __NovaHook

    if ($state.Running) {
      $state.Running = $false
      $code = 0
      $last = Get-History -Count 1
      if ($last -and $last.Id -ne $state.HistoryId -and "$($last.ExecutionStatus)" -eq 'Stopped') {
        $code = 130 # stopped with Ctrl+C
      } elseif (-not $ok) {
        $code = 1
        if ($nativeExit -is [int] -and $nativeExit -ne 0 -and $nativeExit -ne $state.ExitAtStart) { $code = $nativeExit }
      }
      # A program ended by Ctrl+C (STATUS_CONTROL_C_EXIT) counts as stopped too.
      if ($code -eq -1073741510) { $code = 130 }
      if ($last) { $state.HistoryId = $last.Id }
      [void]$out.Append((__NovaOsc "133;D;$code"))
      # A blank line between blocks, so each command has room to breathe.
      [void]$out.Append("`n")
    }

    # The folder, when it's one on disk (not the registry or Cert: drives).
    $location = $ExecutionContext.SessionState.Path.CurrentLocation
    if ($location.Provider.Name -eq 'FileSystem') {
      $path = $location.ProviderPath -replace '\\', '/'
      if (-not $path.StartsWith('/')) { $path = '/' + $path }
      $encoded = ($path.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
      [void]$out.Append((__NovaOsc "7;file://$($env:COMPUTERNAME)$encoded"))
    }

    if ($env:PATH -ne $state.SentPath) {
      $state.SentPath = $env:PATH
      [void]$out.Append((__NovaOsc "6973;path;$($env:PATH)"))
    }
    $histFile = $null
    try { $histFile = (Get-PSReadLineOption).HistorySavePath } catch { }
    if ($histFile -and $histFile -ne $state.SentHistFile) {
      $state.SentHistFile = $histFile
      [void]$out.Append((__NovaOsc "6973;histfile;$histFile"))
    }
    # Aliases, plus functions from your profile.
    $names = @(Get-Alias | ForEach-Object { $_.Name }) + @(Get-ChildItem Function: | Where-Object { $_.Name -notlike '__Nova*' } | ForEach-Object { $_.Name })
    $aliases = $names -join ' '
    if ($aliases -ne $state.SentAliases) {
      $state.SentAliases = $aliases
      [void]$out.Append((__NovaOsc "6973;aliases;$aliases"))
    }
    $lookup = $state.Commands
    if ($lookup -and -not $state.CommandsSent -and $lookup.Result.IsCompleted) {
      $state.CommandsSent = $true
      try {
        $commands = @($lookup.Shell.EndInvoke($lookup.Result))[0]
        if ($commands) { [void]$out.Append((__NovaOsc "6973;commands;$commands")) }
      } catch { }
      $lookup.Shell.Dispose()
    }

    # Nova shows the folder and branch in its own input box, so the prompt
    # is just two invisible marks.
    [void]$out.Append((__NovaOsc '133;A'))
    [void]$out.Append((__NovaOsc '133;B'))
    $global:LASTEXITCODE = $nativeExit
    return $out.ToString()
  }
}
