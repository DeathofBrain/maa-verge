#pragma once

#include <nlohmann/json.hpp>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <functional>
#include <map>
#include <mutex>
#include <optional>
#include <queue>
#include <string>
#include <thread>
#include <vector>

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
  Deadline(std::string operation, int timeout_ms, std::function<void()> before_exit = {});
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

}  // namespace maaverge
