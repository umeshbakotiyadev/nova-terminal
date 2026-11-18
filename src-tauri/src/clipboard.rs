//! Reading the clipboard for Nova's own right-click "Paste".
//!
//! The web clipboard API makes macOS show an extra "Paste" confirmation
//! bubble, so the text is read natively instead.

/// The clipboard's text ("" if it holds no text).
#[tauri::command]
pub fn clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        use std::ffi::{c_char, CStr};

        use objc2::runtime::AnyObject;
        use objc2::{class, msg_send};

        let pasteboard: *mut AnyObject = msg_send![class!(NSPasteboard), generalPasteboard];
        if pasteboard.is_null() {
            return Err("no clipboard".into());
        }
        let kind: *mut AnyObject =
            msg_send![class!(NSString), stringWithUTF8String: c"public.utf8-plain-text".as_ptr()];
        let text: *mut AnyObject = msg_send![&*pasteboard, stringForType: kind];
        if text.is_null() {
            return Ok(String::new());
        }
        let utf8: *const c_char = msg_send![&*text, UTF8String];
        if utf8.is_null() {
            return Ok(String::new());
        }
        Ok(CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("not supported here".into())
    }
}
