#pragma once

#include <nlohmann/json.hpp>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <filesystem>
#include <map>
#include <mutex>
#include <optional>
#include <queue>
#include <string>
#include <thread>

namespace maaverge {
using Json = nlohmann::json;
namespace fs = std::filesystem;
inline constexpr int protocol_version = 1;
inline constexpr std::size_t max_message_bytes = 4 * 1024 * 1024;

fs::path from_utf8(const std::string& text);
std::string to_utf8(const fs::path& path);
fs::path absolute_path(const std::string& text);
std::string required_string(const Json& value, const char* key);
void check_protocol(const Json& value);
int duration_ms(const Json& value, const char* key, int fallback, int maximum = 120000);
bool read_message(std::string& line);

// Own the original stdout descriptor before redirecting every native output path.
class Protocol final {
 public:
  Protocol();
  ~Protocol();
  Protocol(const Protocol&) = delete;
  Protocol& operator=(const Protocol&) = delete;
  void send(Json value);
 private:
  std::FILE* stream_ = nullptr;
  std::mutex mutex_;
};

// A wedged native call cannot be cancelled safely. Fail the isolated process;
// the supervisor reports an unknown result and must never replay it blindly.
class Deadline final {
 public:
  Deadline(std::string operation, int timeout_ms);
  ~Deadline();
  Deadline(const Deadline&) = delete;
  Deadline& operator=(const Deadline&) = delete;
 private:
  std::mutex mutex_;
  std::condition_variable condition_;
  bool done_ = false;
  std::thread thread_;
};

class DeviceLease final {
 public:
  DeviceLease(const fs::path& path, int timeout_ms);
  ~DeviceLease();
  DeviceLease(const DeviceLease&) = delete;
  DeviceLease& operator=(const DeviceLease&) = delete;
 private:
#ifdef _WIN32
  void* handle_ = nullptr;
#else
  int descriptor_ = -1;
#endif
};

using Callback = void (*)(int, const char*, void*);
struct Api final {
  explicit Api(const fs::path& core);
  ~Api();
  Api(const Api&) = delete;
  Api& operator=(const Api&) = delete;
  const char* (*version)() = nullptr;
  bool (*set_user_dir)(const char*) = nullptr;
  bool (*load_resource)(const char*) = nullptr;
  void* (*create)() = nullptr;
  void* (*create_ex)(Callback, void*) = nullptr;
  void (*destroy)(void*) = nullptr;
  void (*set_connection_extras)(const char*, const char*) = nullptr;
  int (*connect)(void*, const char*, const char*, const char*, bool) = nullptr;
  int (*screencap)(void*, bool) = nullptr;
  int (*append)(void*, const char*, const char*) = nullptr;
  bool (*start)(void*) = nullptr;
  bool (*stop)(void*) = nullptr;
  bool (*running)(void*) = nullptr;
 private:
  void* library_ = nullptr;
#ifdef _WIN32
  void* directory_cookie_ = nullptr;
#endif
  void* symbol(const char* name, bool required = true);
  void unload() noexcept;
};

Json validate(const Json& config);

class Core final {
 public:
  Core(const Json& config, Protocol& protocol);
  ~Core();
  Core(const Core&) = delete;
  Core& operator=(const Core&) = delete;
  void begin_events();
  Json command(const Json& value);
 private:
  static void callback(int message, const char* details, void* context) noexcept;
  void pump();
  void drain_events();
  void close() noexcept;
  void capture_failed(const std::string& error);
  Json config_;
  Protocol& protocol_;
  Api api_;
  void* handle_ = nullptr;
  std::mutex mutex_;
  std::mutex event_mutex_;
  std::queue<Json> events_;
  std::map<int, std::chrono::steady_clock::time_point> pending_;
  std::string connection_config_ = "General";
  std::string expected_capture_method_;
  std::string observed_capture_method_;
  std::string capture_error_;
  Json connection_extras_;
  bool capture_verified_ = false;
  bool connected_ = false;
  std::condition_variable stop_condition_;
  bool stopping_ = false;
  std::thread pump_;
  int call_timeout_ms_;
  int async_timeout_ms_;
  int shutdown_timeout_ms_;
};
}  // namespace maaverge
