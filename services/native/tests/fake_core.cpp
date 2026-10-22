// Synthetic C API only: no ADB, device, network, paid model or genuine MaaCore.
#include "native.hpp"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <limits>
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
nlohmann::json connection_extras = nlohmann::json::object();
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
  std::string config;
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
#ifndef OMIT_CAPTURE
EXPORT void AsstSetConnectionExtras(const char* name, const char* extras) {
  connection_extras[name] = nlohmann::json::parse(extras);
  trace(("extras:" + std::string(name) + ":" + connection_extras[name].dump()).c_str());
}
#endif
EXPORT int AsstAsyncConnect(void* handle, const char*, const char*, const char* config, bool) {
  if (scenario() == "connect-reject") return 0;
  if (scenario() == "call-hang") std::this_thread::sleep_for(std::chrono::seconds(10));
  if (scenario() == "async-hang") return 7;
  auto* instance = static_cast<Instance*>(handle);
  instance->config = config;
  trace(("connect:" + instance->config).c_str());
  if (instance->config != "General" && !connection_extras.contains(instance->config)) return 0;
  instance->threads.emplace_back([instance] {
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    if (instance->config != "General" && scenario() != "capture-no-evidence") {
      const std::string method = scenario() == "capture-fallback" ? "RawWithGzip" :
                                 instance->config == "MuMuEmulator12" ? "MumuExtras" : "LDExtras";
      instance->send(2, {{"what", "FastestWayToScreencap"}, {"details", {{"method", method}, {"cost", 2}}}});
    }
    instance->send(4, {{"async_call_id", 7}, {"what", "Connect"},
                       {"details", {{"ret", scenario() != "capture-connect-failure"}}}});
  });
  return 7;
}
#ifndef OMIT_CAPTURE
EXPORT int AsstAsyncScreencap(void* handle, bool block) {
  if (scenario() == "screencap-reject") return 0;
  trace("screencap");
  if (block) trace("screencap-blocking");
  auto* instance = static_cast<Instance*>(handle);
  auto complete = [instance] {
    if (scenario() == "capture-late-fallback") {
      instance->send(2, {{"what", "FastestWayToScreencap"}, {"details", {{"method", "Encode"}, {"cost", 3}}}});
    }
    instance->send(4, {{"async_call_id", scenario() == "screencap-wrong-id" ? 18 : 17},
                       {"what", scenario() == "screencap-wrong-what" ? "Click" : "Screencap"},
                       {"details", {{"ret", scenario() != "screencap-failure"}}}});
  };
  if (block && scenario() != "screencap-callback-delay") complete();
  else instance->threads.emplace_back([complete] {
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    complete();
  });
  return 17;
}
#endif
#ifndef OMIT_PREVIEW
EXPORT std::uint64_t AsstGetImage(void*, void* buffer, std::uint64_t buffer_size) {
  trace("get-image");
  if (scenario() == "image-null-size") return std::numeric_limits<std::uint64_t>::max();
  if (scenario() == "image-oversize") return buffer_size + 1;
  if (scenario() == "image-empty") return 0;
  std::vector<unsigned char> image = {
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0, 253, 212, 154, 115,
    0, 0, 0, 18, 73, 68, 65, 84, 120, 156, 99, 8, 104, 218, 18,
    208, 180, 133, 1, 66, 1, 0, 41, 38, 6, 25, 155, 100, 95, 64,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  };
  if (scenario() == "image-invalid-png") image[0] = 0;
  if (scenario() == "image-invalid-ihdr") image[15] = 0;
  if (scenario() == "image-wide") { image[18] = 32; image[19] = 1; }
  if (scenario() == "image-too-many-pixels") {
    image[18] = image[22] = 32;
    image[19] = image[23] = 0;
  }
  if (scenario() == "image-zero-dimension") image[19] = 0;
  if (scenario() == "image-limit") image.resize(3 * 1024 * 1024 - 8192, 0);
  if (image.size() > buffer_size) return std::numeric_limits<std::uint64_t>::max();
  std::memcpy(buffer, image.data(), image.size());
  return scenario() == "image-truncated" ? 20 : image.size();
}

EXPORT int AsstAsyncClick(void* handle, std::int32_t x, std::int32_t y, std::uint8_t block) {
  trace(("click:" + std::to_string(x) + ":" + std::to_string(y) + ":" + (block ? "block" : "async")).c_str());
  if (scenario() == "click-reject") return 0;
  if (scenario() == "click-hang") std::this_thread::sleep_for(std::chrono::seconds(10));
  auto* instance = static_cast<Instance*>(handle);
  auto complete = [instance] {
    if (scenario() == "click-disconnect") instance->send(2, {{"what", "Disconnect"}});
    auto ret = nlohmann::json(scenario() != "click-failure");
    if (scenario() == "click-invalid-ret") ret = "true";
    instance->send(4, {{"async_call_id", scenario() == "click-wrong-id" ? 28 : 27},
                       {"what", scenario() == "click-wrong-what" ? "Screencap" : "Click"},
                       {"details", {{"ret", std::move(ret)}}}});
  };
  if (block && scenario() != "click-callback-delay") complete();
  else instance->threads.emplace_back([complete] {
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    complete();
  });
  return 27;
}
#endif
EXPORT int AsstAppendTask(void* handle, const char* type, const char*) {
  trace("append-task");
  static_cast<Instance*>(handle)->type = type;
  return scenario() == "task-reject" ? 0 : 11;
}
EXPORT bool AsstStart(void* handle) {
  if (scenario() == "start-reject") return false;
  auto* instance = static_cast<Instance*>(handle);
  instance->running = true;
  instance->stopped = false;
  instance->threads.emplace_back([instance] {
    std::this_thread::sleep_for(std::chrono::milliseconds(scenario() == "task-hold" ? 800 : 150));
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
