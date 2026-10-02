// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--allora-mcp") {
        if let Err(error) = app_lib::run_mcp_stdio() {
            eprintln!("Allora MCP: {error}");
            std::process::exit(1);
        }
        return;
    }
    app_lib::run();
}
