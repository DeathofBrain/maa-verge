# Unmodified nlohmann/json 3.12.0 single header; provenance is in README.md.
file(SHA256 "${CMAKE_CURRENT_SOURCE_DIR}/include/nlohmann/json.hpp" nlohmann_json_sha256)
if(NOT nlohmann_json_sha256 STREQUAL "aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63")
  message(FATAL_ERROR "Vendored nlohmann/json 3.12.0 header SHA-256 mismatch")
endif()

add_library(nlohmann_json INTERFACE)
add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
target_include_directories(nlohmann_json SYSTEM INTERFACE "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_compile_features(nlohmann_json INTERFACE cxx_std_11)
