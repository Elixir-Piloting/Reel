use regex::Regex;

pub struct ProgressInfo {
    pub percent: f64,
    pub speed: String,
    pub eta: String,
}

pub fn parse_progress(line: &str) -> Option<ProgressInfo> {
    if !line.contains("[download]") || !line.contains('%') {
        return None;
    }

    // Extract percentage: [download]   0.0%
    let percent = {
        let re = Regex::new(r"\[download\]\s+(\d+\.?\d*)%").ok()?;
        re.captures(line)?.get(1)?.as_str().parse().unwrap_or(0.0)
    };

    // Extract speed: "at  X.XXKiB/s" or "at  X.XXMiB/s"
    let speed = Regex::new(r"at\s+([\d.]+[KMG]?i?B/s)")
        .ok()
        .and_then(|r| r.captures(line))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    // Extract ETA (case-insensitive): "ETA 00:30" or "eta 00:30"
    let eta = Regex::new(r"(?i)\beta\s+(\S+)")
        .ok()
        .and_then(|r| r.captures(line))
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    Some(ProgressInfo { percent, speed, eta })
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
