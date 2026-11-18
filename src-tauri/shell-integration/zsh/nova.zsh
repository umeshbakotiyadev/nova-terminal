# Nova Terminal shell integration for zsh.
#
# Sends invisible escape codes that let Nova:
#   OSC 133 A/B  - know where the prompt is (so it can use its own input box)
#   OSC 133 C    - know a command started (hide the input box, show "running")
#   OSC 133 D;n  - know it finished, with its exit code (draw the block, red if failed)
#   OSC 7        - know the current folder (tab name, folder chip, git branch)

[[ -n "$__NOVA_LOADED" ]] && return
typeset -g __NOVA_LOADED=1
typeset -gi __nova_running=0
typeset -gi __nova_status=0
typeset -g __nova_sent_path=""
typeset -g __nova_sent_aliases=""
typeset -g __nova_sent_histfile=""

__nova_save_status() {
  __nova_status=$?
}

__nova_precmd() {
  if (( __nova_running )); then
    builtin printf '\e]133;D;%d\a' "$__nova_status"
    __nova_running=0
    # A blank line between blocks, so each command has room to breathe.
    builtin print ''
  fi
  builtin printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"

  # For suggestions and colouring in Nova's input box: your PATH (to find
  # installed commands) and alias names. Only sent when they change.
  if [[ "$PATH" != "$__nova_sent_path" ]]; then
    __nova_sent_path="$PATH"
    builtin printf '\e]6973;path;%s\a' "$PATH"
  fi
  local __nova_histfile="${HISTFILE:-$HOME/.zsh_history}"
  if [[ "$__nova_histfile" != "$__nova_sent_histfile" ]]; then
    __nova_sent_histfile="$__nova_histfile"
    builtin printf '\e]6973;histfile;%s\a' "$__nova_histfile"
  fi
  local __nova_alias_names="${(kj: :)aliases}"
  if [[ "$__nova_alias_names" != "$__nova_sent_aliases" ]]; then
    __nova_sent_aliases="$__nova_alias_names"
    builtin printf '\e]6973;aliases;%s\a' "$__nova_alias_names"
  fi

  # Stay first (to read the real exit status) and last (so Nova's prompt
  # wins over themes like oh-my-zsh or powerlevel10k).
  if [[ "${precmd_functions[1]}" != __nova_save_status ]]; then
    precmd_functions=(__nova_save_status ${precmd_functions:#__nova_save_status})
  fi
  if [[ "${precmd_functions[-1]}" != __nova_precmd ]]; then
    precmd_functions=(${precmd_functions:#__nova_precmd} __nova_precmd)
  fi

  # Nova shows the folder and branch in its own input box, so the shell's
  # prompt is replaced by two invisible marks.
  PROMPT=$'%{\e]133;A\a%}%{\e]133;B\a%}'
  RPROMPT=''
}

__nova_preexec() {
  __nova_running=1
  builtin printf '\e]133;C;%s\a' "${1//[[:cntrl:]]/ }"
}

# Commands you run show up bold above their output (unless you've set your
# own zle_highlight, or use a syntax-highlighting plugin, which wins anyway).
(( ${#zle_highlight} )) || zle_highlight=(default:bold)

typeset -ga precmd_functions preexec_functions
precmd_functions=(__nova_save_status ${precmd_functions[@]} __nova_precmd)
preexec_functions+=(__nova_preexec)
