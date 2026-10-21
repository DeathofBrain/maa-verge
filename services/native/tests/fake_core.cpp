// Synthetic C API only: no ADB, device, network, paid model or genuine MaaCore.
#include "native.hpp"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#ifdef _WIN32
#include <windows.h>
#define EXPORT extern "C" __declspec(dllexport)
#else
#define EXPORT extern "C" __attribute__((visibility("default")))
#endif

namespace {
std::string user_directory;
std::string scenario() {
  const char* value = std::getenv("MAAVERGE_SYNTHETIC_CASE");
  return value ? value : "";
}
void trace(const char* text) {
#ifdef _WIN32
  if (const wchar_t* value = _wgetenv(L"MAAVERGE_SYNTHETIC_TRACE")) {
    std::ofstream output(std::filesystem::path(value), std::ios::app);
#else
  if (const char* value = std::getenv("MAAVERGE_SYNTHETIC_TRACE")) {
    std::ofstream output(std::filesystem::path(std::u8string(value, value + std::char_traits<char>::length(value))), std::ios::app);
#endif
    output << text << '\n';
  }
}
struct Instance {
  maaverge::Callback callback;
  void* context;
  std::atomic<bool> running = false;
  std::atomic<bool> stopped = false;
  std::vector<std::thread> threads;
  std::string type;
  void send(int message, const nlohmann::json& payload) {
    // The copied buffer becomes invalid immediately after this native callback.
    auto text = payload.dump();
    callback(message, text.c_str(), context);
    text.assign(text.size(), 'x');
  }
};
}  // namespace

EXPORT const char* AsstGetVersion() { return "vsynthetic"; }
EXPORT bool AsstSetUserDir(const char* path) {
  user_directory = path;
  std::printf("synthetic native stdout: set user directory\n");
  std::fflush(stdout);
#ifdef _WIN32
  constexpr char direct[] = "synthetic native Win32 stdout\n";
  DWORD written = 0;
  WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), direct, sizeof(direct) - 1, &written, nullptr);
#endif
  return scenario() != "user-failure";
}
EXPORT bool AsstLoadResource(const char*) {
  if (scenario() != "resource-failure") return true;
  const auto path = std::filesystem::path(std::u8string(user_directory.begin(), user_directory.end())) / "debug";
  std::filesystem::create_directories(path);
  std::ofstream output(path / "asst.log");
  for (int index = 0; index < 100; ++index) output << "[ERR] synthetic missing resource " << index << '\n';
  return false;
}
EXPORT void* AsstCreate() { return nullptr; }
EXPORT void* AsstCreateEx(maaverge::Callback callback, void* context) {
  if (scenario() == "create-failure") return nullptr;
  auto* instance = new Instance;
  instance->callback = callback;
  instance->context = context;
  return instance;
}
EXPORT void AsstDestroy(void* handle) {
  auto* instance = static_cast<Instance*>(handle);
  trace("destroy-start");
  if (scenario() == "destroy-hang") std::this_thread::sleep_for(std::chrono::seconds(10));
  if (scenario() == "destroy-delay") std::this_thread::sleep_for(std::chrono::milliseconds(400));
  for (auto& thread : instance->threads) thread.join();
  instance->send(9000, {{"teardown", true}});
  trace("destroy-done");
  std::fprintf(stdout, "synthetic native stdout: destroyed\n");
  delete instance;
}
EXPORT int AsstAsyncConnect(void* handle, const char*, const char*, const char*, bool) {
  if (scenario() == "connect-reject") return 0;
  if (scenario() == "call-hang") std::this_thread::sleep_for(std::chrono::seconds(10));
  if (scenario() == "async-hang") return 7;
  auto* instance = static_cast<Instance*>(handle);
  instance->threads.emplace_back([instance] {
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    instance->send(4, {{"async_call_id", 7}, {"what", "Connect"}, {"details", {{"ret", true}}}});
  });
  return 7;
}
EXPORT int AsstAppendTask(void* handle, const char* type, const char*) {
  static_cast<Instance*>(handle)->type = type;
  return scenario() == "task-reject" ? 0 : 11;
}
EXPORT bool AsstStart(void* handle) {
  if (scenario() == "start-reject") return false;
  auto* instance = static_cast<Instance*>(handle);
  instance->running = true;
  instance->stopped = false;
  instance->threads.emplace_back([instance] {
    std::this_thread::sleep_for(std::chrono::milliseconds(150));
    if (instance->stopped) return;
    if (scenario() == "malformed-callback") instance->callback(9001, "{not json", instance->context);
    instance->send(10002, {{"taskid", 11}, {"taskchain", instance->type}});
    instance->send(3, {{"taskid", 11}});
    instance->running = false;
  });
  return true;
}
EXPORT bool AsstStop(void* handle) {
  auto* instance = static_cast<Instance*>(handle);
  instance->stopped = true;
  instance->running = false;
  trace("stop-cleared-queue");
  return true;
}
#ifndef OMIT_RUNNING
EXPORT bool AsstRunning(void* handle) { return static_cast<Instance*>(handle)->running; }
#endif
