use regex::Regex;

pub struct ProgressInfo {
    pub percent: f64,
    pub speed: String,
    pub eta: String,
}

pub fn parse_progress(line: &str) -> Option<ProgressInfo> {
    let re = Regex::new(
        r"\[download\]\s+(\d+\.?\d*)%\s*(?:of\s+~?\s*[\d.]+\w+i?B\s+)?at\s+([\d.]+[KMG]?i?B/s)\s+eta\s+(\S+)"
    ).ok()?;

    if let Some(caps) = re.captures(line) {
        Some(ProgressInfo {
            percent: caps[1].parse().unwrap_or(0.0),
            speed: caps[2].to_string(),
            eta: caps[3].to_string(),
        })
    } else {
        None
    }
}

pub fn parse_ffmpeg_progress(line: &str) -> Option<f64> {
    let re = Regex::new(r"time=(\d+):(\d+):(\d+)\.(\d+)").ok()?;
    if let Some(caps) = re.captures(line) {
        let hours: f64 = caps[1].parse().unwrap_or(0.0);
        let minutes: f64 = caps[2].parse().unwrap_or(0.0);
        let seconds: f64 = caps[3].parse().unwrap_or(0.0);
        Some(hours * 3600.0 + minutes * 60.0 + seconds)
    } else {
        None
    }
}
