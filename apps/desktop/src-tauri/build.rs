fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Include the same Common Controls activation context in all targets,
        // including unit test harnesses that do not receive Tauri's bin resource.
        // MockRuntime's updater code imports TaskDialogIndirect from v6.
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        // The desktop binary already links Tauri's full manifest as a resource;
        // generating a second one would duplicate resource #1 (also in bin tests).
        println!("cargo:rustc-link-arg-bin=maaverge=/MANIFEST:NO");
    }
}
