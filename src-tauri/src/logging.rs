use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

fn log_file() -> &'static Mutex<Option<std::fs::File>> {
    static LOG_FILE: OnceLock<Mutex<Option<std::fs::File>>> = OnceLock::new();
    LOG_FILE.get_or_init(|| Mutex::new(None))
}

pub fn init(app_data_dir: PathBuf) {
    let log_dir = app_data_dir.join("logs");
    fs::create_dir_all(&log_dir).ok();
    let path = log_dir.join("reel.log");
    let file = OpenOptions::new().create(true).append(true).open(path).ok();
    *log_file().lock().unwrap() = file;
    log_info("Logging initialized");
}

pub fn log_info(msg: &str) {
    let line = format!("[{}] [INFO] {}", now(), msg);
    eprintln!("{line}");
    if let Ok(mut guard) = log_file().lock() {
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "{line}");
        }
    }
}

pub fn log_error(msg: &str) {
    let line = format!("[{}] [ERROR] {}", now(), msg);
    eprintln!("{line}");
    if let Ok(mut guard) = log_file().lock() {
        if let Some(file) = guard.as_mut() {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "?".to_string())
}
