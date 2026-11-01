#pragma once

#include "native.hpp"

#include <atomic>
#include <memory>

namespace maaverge {
// The implementation includes only the pinned upstream C headers. No MaaFW
// symbol is linked into this executable or resolved in a MaaCore process.
class Framework final {
 public:
  explicit Framework(const Json& config);
  ~Framework();
  Framework(const Framework&) = delete;
  Framework& operator=(const Framework&) = delete;
  Json command(const Json& command);
  void prepare();
  Json stop();
  Json validation();
  const std::string& version() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

int framework_main(const Json& config, Protocol& protocol, bool validation);
}  // namespace maaverge
