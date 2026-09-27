use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUsage {
    pub cpu_percent: f64,
    pub memory_bytes: u64,
    pub total_memory_bytes: Option<u64>,
    pub process_count: usize,
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn resource_usage() -> Result<ResourceUsage, String> {
    tauri::async_runtime::spawn_blocking(measure_resource_usage)
        .await
        .map_err(|error| format!("Could not measure resource usage: {error}"))?
}

#[cfg(target_os = "macos")]
fn measure_resource_usage() -> Result<ResourceUsage, String> {
    use std::collections::HashSet;
    use std::process::{Command, Stdio};

    let collector = Command::new("ps")
        .args(["-axo", "pid=,ppid=,%cpu=,rss="])
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not read process usage: {error}"))?;
    let collector_pid = collector.id();
    let output = collector
        .wait_with_output()
        .map_err(|error| format!("Could not read process usage: {error}"))?;
    if !output.status.success() {
        return Err("Could not read process usage.".to_string());
    }

    let processes: Vec<(u32, u32, f64, u64)> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some((
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
                fields.next()?.parse().ok()?,
            ))
        })
        .collect();

    let mut included = HashSet::from([std::process::id()]);
    loop {
        let mut added = false;
        for (pid, parent, _, _) in &processes {
            if included.contains(parent) && included.insert(*pid) {
                added = true;
            }
        }
        if !added {
            break;
        }
    }

    let mut cpu_percent = 0.0;
    let mut memory_bytes = 0_u64;
    let mut process_count = 0;
    for (pid, _, cpu, resident_kib) in processes {
        if pid != collector_pid && included.contains(&pid) {
            cpu_percent += cpu;
            memory_bytes = memory_bytes.saturating_add(resident_kib.saturating_mul(1024));
            process_count += 1;
        }
    }
    if process_count == 0 {
        return Err("The app process could not be found.".to_string());
    }

    let total_memory_bytes = Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
        .ok()
        .filter(|result| result.status.success())
        .and_then(|result| String::from_utf8(result.stdout).ok())
        .and_then(|value| value.trim().parse().ok());

    Ok(ResourceUsage {
        cpu_percent,
        memory_bytes,
        total_memory_bytes,
        process_count,
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn resource_usage() -> Result<ResourceUsage, String> {
    Err("Resource usage is currently available on macOS only.".to_string())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn measures_running_app_process() {
        let usage = super::measure_resource_usage().expect("process usage should be available");
        assert!(usage.process_count >= 1);
        assert!(usage.memory_bytes > 0);
        assert!(usage.cpu_percent >= 0.0);
    }
}
