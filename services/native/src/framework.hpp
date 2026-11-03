#pragma once

#include "native.hpp"

#include <atomic>
#include <memory>

namespace maaverge {
// 独立 MaaFramework worker：只动态加载固定上游 C API，负责原生执行及有界回调上下文。
// JSON 与 Context 子任务均交给官方运行时，工作进程不解释游戏业务数据库。
class Framework final {
 public:
  explicit Framework(const Json& config);
  ~Framework();
  Framework(const Framework&) = delete;
  Framework& operator=(const Framework&) = delete;
  Json command(const Json& command);
  void set_sender(std::function<void(Json)> sender);
  void dispatch_custom(const Json& command);
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
