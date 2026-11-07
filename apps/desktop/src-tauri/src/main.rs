#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 二进制入口保持最薄，窗口与侧进程生命周期统一由库入口管理。
fn main() {
    maaverge_lib::run();
}
