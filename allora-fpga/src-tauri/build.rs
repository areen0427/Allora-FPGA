fn main() {
    // Native icons are embedded in the binary, including the macOS dev Dock icon.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
