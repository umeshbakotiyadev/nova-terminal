//! Background blur with an adjustable radius.
//!
//! macOS's standard frosted glass (NSVisualEffectView) has one fixed blur
//! strength. Terminals like iTerm2, kitty and Ghostty instead ask the window
//! server to blur whatever is behind the window by a given radius, which is
//! what the "Background blur" slider in Settings does.

/// Blurs what's behind the window by `radius` points (0 turns blur off).
/// Has a visible effect only while the window is see-through (opacity < 100%).
#[tauri::command]
pub fn set_blur_radius(window: tauri::WebviewWindow, radius: u32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Sync commands run on the main thread, where AppKit must be used.
        let ns_window = window.ns_window().map_err(|e| e.to_string())?;
        unsafe { macos::set_radius(ns_window, radius.min(100))? };
        if radius > 0 {
            macos::reclip_corners(&window);
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, radius);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::time::Duration;

    use objc2::runtime::AnyObject;
    use objc2::{msg_send, sel};

    // Window-server calls (part of CoreGraphics). Not in Apple's public
    // headers, but stable for years and used by iTerm2, kitty and Ghostty.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSDefaultConnectionForThread() -> i32;
        fn CGSSetWindowBackgroundBlurRadius(connection: i32, window: u32, radius: i32) -> i32;
    }

    pub unsafe fn set_radius(ns_window: *mut c_void, radius: u32) -> Result<(), String> {
        if ns_window.is_null() {
            return Err("no native window".into());
        }
        let window = &*(ns_window as *const AnyObject);
        let number: isize = msg_send![window, windowNumber];
        if number <= 0 {
            return Err("window not on screen yet".into());
        }
        let status = CGSSetWindowBackgroundBlurRadius(
            CGSDefaultConnectionForThread(),
            number as u32,
            radius as i32,
        );
        if status == 0 {
            Ok(())
        } else {
            Err(format!(
                "the window server refused the blur (error {status})"
            ))
        }
    }

    /// Bumped on every re-clip, so only the newest one releases the pin.
    static RECLIP: AtomicU64 = AtomicU64::new(0);
    static PINNED: AtomicBool = AtomicBool::new(false);

    /// The window server clips the blur to the window's rounded corners only
    /// if it receives the corner shape *after* blur was turned on; otherwise
    /// the blur fills the full rectangle and the corners look square. Pinning
    /// AppKit's corner radius at its current value makes it send the shape
    /// again (nothing visibly changes). After a few frames the pin is
    /// released (0 hands the radius back to AppKit).
    pub fn reclip_corners(window: &tauri::WebviewWindow) {
        let Ok(ns_window) = window.ns_window() else {
            return;
        };
        if !PINNED.load(Ordering::SeqCst) {
            if !unsafe { pin_corner_radius(ns_window, None) } {
                return; // private selectors missing: nothing to do
            }
            PINNED.store(true, Ordering::SeqCst);
        }
        let generation = RECLIP.fetch_add(1, Ordering::SeqCst) + 1;
        let window = window.clone();
        std::thread::spawn(move || {
            // Well over the ~8 frames the server needs to render the pin.
            std::thread::sleep(Duration::from_millis(300));
            if RECLIP.load(Ordering::SeqCst) != generation {
                return; // a newer re-clip will release it
            }
            let target = window.clone();
            let _ = window.run_on_main_thread(move || {
                if RECLIP.load(Ordering::SeqCst) != generation {
                    return;
                }
                if let Ok(ns_window) = target.ns_window() {
                    unsafe { pin_corner_radius(ns_window, Some(0.0)) };
                }
                PINNED.store(false, Ordering::SeqCst);
            });
        });
    }

    /// Sets AppKit's corner radius (`None` = pin it at its current value).
    /// Returns false if this macOS doesn't have the (private) selectors.
    unsafe fn pin_corner_radius(ns_window: *mut c_void, value: Option<f64>) -> bool {
        if ns_window.is_null() {
            return false;
        }
        let window = &*(ns_window as *const AnyObject);
        let can_get: bool = msg_send![window, respondsToSelector: sel!(_cornerRadius)];
        let can_set: bool = msg_send![window, respondsToSelector: sel!(_setCornerRadius:)];
        if !can_get || !can_set {
            return false;
        }
        let radius: f64 = match value {
            Some(v) => v,
            None => {
                let current: f64 = msg_send![window, _cornerRadius];
                if current <= 0.0 {
                    return false; // e.g. full screen: square anyway
                }
                current
            }
        };
        let _: () = msg_send![window, _setCornerRadius: radius];
        true
    }
}
