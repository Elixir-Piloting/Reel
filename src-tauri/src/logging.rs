use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

fn log_file() -> &'static Mutex<Option<std::fs::File>> {
    static LOG_FILE: OnceLock<Mutex<Option<std::fs::File>>> = OnceLock::new();
    LOG_FILE.get_or_init(|| Mutex::new(None))
}

static LAST_ATTEMPT: OnceLock<Mutex<Instant>> = OnceLock::new();
const COOLDOWN: Duration = Duration::from_secs(5);

fn write_log(entry: &str) {
    eprintln!("{}", entry);
    let last = LAST_ATTEMPT.get_or_init(|| Mutex::new(Instant::now()));
    match log_file().lock() {
        Ok(mut guard) => {
            if let Some(ref mut file) = *guard {
                let _ = writeln!(file, "{}", entry);
            }
            *last.lock().unwrap() = Instant::now();
        }
        Err(_) => {
            let elapsed = last.lock().unwrap().elapsed();
            if elapsed >= COOLDOWN {
                if let Ok(new_file) = OpenOptions::new()
                    .append(true)
                    .create(true)
                    .open("ytmate.log")
                {
                    let mut poisoned = log_file().lock().unwrap_or_else(|e| e.into_inner());
                    *poisoned = Some(new_file);
                }
                *last.lock().unwrap() = Instant::now();
            }
        }
    }
}

pub fn init(app_data_dir: PathBuf) {
    let log_dir = app_data_dir.join("logs");
    fs::create_dir_all(&log_dir).ok();
    let path = log_dir.join("reel.log");
    if let Ok(file) = OpenOptions::new().create(true).append(true).open(&path) {
        if let Ok(mut guard) = log_file().lock() {
            *guard = Some(file);
        }
    }
    write_log("[INIT] Logging initialized");
}

pub fn log_info(msg: &str) {
    let line = format!("[{}] [INFO] {}", now(), msg);
    write_log(&line);
}

pub fn log_error(msg: &str) {
    let line = format!("[{}] [ERROR] {}", now(), msg);
    write_log(&line);
}

#[tauri::command]
pub fn log_to_file(level: String, message: String, meta: String) {
    let extra = if meta.is_empty() { String::new() } else { format!(" | meta={}", meta) };
    let line = format!("[{}] [{}] {} {}", now(), level.to_uppercase(), message, extra);
    write_log(&line);
}

fn now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    // Format as ISO 8601 with seconds precision
    let secs = dur.as_secs();
    // Simple conversion to UTC datetime
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;
    // Date from days since epoch (March 1-based algorithm)
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let days_in_year = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) { 366 } else { 365 };
        if d < days_in_year { break; }
        d -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 1u32;
    for &md in &month_days {
        if d < md as i64 { break; }
        d -= md as i64;
        m += 1;
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m, d + 1, hours, minutes, seconds)
}
